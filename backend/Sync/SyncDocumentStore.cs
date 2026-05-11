using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;

namespace ParliamentApi.Sync;

public interface IDocumentStore
{
    Task<StoredDocument> GetOrCreateAsync(
        string documentId,
        string kind,
        string initialBodyJson,
        CancellationToken cancellationToken);

    Task<SnapshotSaveResult> SaveSnapshotAsync(
        SnapshotSaveCommand command,
        CancellationToken cancellationToken);

    Task<ObjectMutationSaveResult> SaveObjectMutationsAsync(
        ObjectMutationSaveCommand command,
        CancellationToken cancellationToken);
}

public sealed record StoredDocument(string Id, string Kind, long Revision, string BodyJson);

public sealed record SnapshotSaveCommand(
    string DocumentId,
    string Kind,
    string ClientId,
    string MutationId,
    long BaseRevision,
    string BodyJson);

public enum SnapshotSaveStatus
{
    Saved,
    Duplicate,
    Conflict,
}

public sealed record SnapshotSaveResult(
    SnapshotSaveStatus Status,
    StoredDocument Document,
    string? AcceptedMutationId = null);

public sealed class EfDocumentStore(IDbContextFactory<SyncDbContext> dbFactory) : IDocumentStore
{
    private readonly SemaphoreSlim _writeGate = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<StoredDocument> GetOrCreateAsync(
        string documentId,
        string kind,
        string initialBodyJson,
        CancellationToken cancellationToken)
    {
        await using var readDb = await dbFactory.CreateDbContextAsync(cancellationToken);
        var existing = await readDb.Documents
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == documentId, cancellationToken);

        if (existing is not null)
        {
            return await EnsureObjectIndexAsync(documentId, cancellationToken);
        }

        await _writeGate.WaitAsync(cancellationToken);
        try
        {
            await using var writeDb = await dbFactory.CreateDbContextAsync(cancellationToken);
            existing = await writeDb.Documents
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == documentId, cancellationToken);

            if (existing is not null) return ToStoredDocument(existing);

            var now = DateTimeOffset.UtcNow;
            var document = new SyncDocument
            {
                Id = documentId,
                Kind = kind,
                Revision = now.ToUnixTimeMilliseconds(),
                BodyJson = NormalizeJson(initialBodyJson),
                UpdatedAt = now,
            };

            writeDb.Documents.Add(document);
            await DocumentObjectIndexer.ApplyIndexAsync(
                writeDb,
                document.Id,
                document.BodyJson,
                document.Revision,
                now,
                cancellationToken);
            await writeDb.SaveChangesAsync(cancellationToken);
            return ToStoredDocument(document);
        }
        finally
        {
            _writeGate.Release();
        }
    }

    public async Task<SnapshotSaveResult> SaveSnapshotAsync(
        SnapshotSaveCommand command,
        CancellationToken cancellationToken)
    {
        var bodyJson = NormalizeJson(command.BodyJson);

        await _writeGate.WaitAsync(cancellationToken);
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
            await using var transaction = await db.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);

            var document = await db.Documents
                .FirstOrDefaultAsync(x => x.Id == command.DocumentId, cancellationToken);

            if (document is null)
            {
                var now = DateTimeOffset.UtcNow;
                document = new SyncDocument
                {
                    Id = command.DocumentId,
                    Kind = command.Kind,
                    Revision = now.ToUnixTimeMilliseconds(),
                    BodyJson = "{}",
                    UpdatedAt = now,
                };
                db.Documents.Add(document);
                await db.SaveChangesAsync(cancellationToken);
            }

            var existingMutation = await db.Mutations
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    x => x.DocumentId == command.DocumentId
                      && x.ClientId == command.ClientId
                      && x.MutationId == command.MutationId,
                    cancellationToken);

            if (existingMutation is not null)
            {
                await transaction.CommitAsync(cancellationToken);
                return new SnapshotSaveResult(
                    SnapshotSaveStatus.Duplicate,
                    ToStoredDocument(document),
                    command.MutationId);
            }

            if (command.BaseRevision <= 0 || command.BaseRevision != document.Revision)
            {
                await transaction.CommitAsync(cancellationToken);
                return new SnapshotSaveResult(
                    SnapshotSaveStatus.Conflict,
                    ToStoredDocument(document));
            }

            var timestampRevision = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var nextRevision = Math.Max(timestampRevision, document.Revision + 1);
            var nowUtc = DateTimeOffset.UtcNow;

            document.BodyJson = bodyJson;
            document.Revision = nextRevision;
            document.UpdatedAt = nowUtc;

            db.Mutations.Add(new SyncMutation
            {
                DocumentId = command.DocumentId,
                ClientId = command.ClientId,
                MutationId = command.MutationId,
                BaseRevision = command.BaseRevision,
                ResultingRevision = nextRevision,
                OperationType = "snapshot.replace",
                OperationJson = bodyJson,
                CreatedAt = nowUtc,
            });

            await DocumentObjectIndexer.ApplyIndexAsync(
                db,
                command.DocumentId,
                bodyJson,
                nextRevision,
                nowUtc,
                cancellationToken);

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return new SnapshotSaveResult(
                SnapshotSaveStatus.Saved,
                ToStoredDocument(document),
                command.MutationId);
        }
        finally
        {
            _writeGate.Release();
        }
    }

    public async Task<ObjectMutationSaveResult> SaveObjectMutationsAsync(
        ObjectMutationSaveCommand command,
        CancellationToken cancellationToken)
    {
        await _writeGate.WaitAsync(cancellationToken);
        try
        {
            await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
            await using var transaction = await db.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);

            var document = await db.Documents
                .FirstOrDefaultAsync(x => x.Id == command.DocumentId, cancellationToken);

            if (document is null)
            {
                var now = DateTimeOffset.UtcNow;
                document = new SyncDocument
                {
                    Id = command.DocumentId,
                    Kind = command.Kind,
                    Revision = now.ToUnixTimeMilliseconds(),
                    BodyJson = "{}",
                    UpdatedAt = now,
                };
                db.Documents.Add(document);
                await db.SaveChangesAsync(cancellationToken);
            }

            var existingMutation = await db.Mutations
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    x => x.DocumentId == command.DocumentId
                      && x.ClientId == command.ClientId
                      && x.MutationId == command.MutationId,
                    cancellationToken);

            if (existingMutation is not null)
            {
                await transaction.CommitAsync(cancellationToken);
                return new ObjectMutationSaveResult(
                    ObjectMutationSaveStatus.Duplicate,
                    ToStoredDocument(document),
                    command.MutationId,
                    []);
            }

            if (!DocumentObjectMutator.TryDescribeOperations(command.Operations, out var operationDescriptors, out var descriptorError))
            {
                return new ObjectMutationSaveResult(
                    ObjectMutationSaveStatus.Invalid,
                    ToStoredDocument(document),
                    Error: descriptorError);
            }

            var conflicts = await FindObjectMutationConflictsAsync(
                db,
                command,
                document,
                operationDescriptors,
                cancellationToken);
            if (conflicts.Count > 0)
            {
                await transaction.CommitAsync(cancellationToken);
                return new ObjectMutationSaveResult(
                    ObjectMutationSaveStatus.Conflict,
                    ToStoredDocument(document),
                    Error: "Object mutation conflicts.",
                    Conflicts: conflicts);
            }

            var applied = DocumentObjectMutator.Apply(document.BodyJson, command.Operations);
            if (!applied.Success)
            {
                return new ObjectMutationSaveResult(
                    ObjectMutationSaveStatus.Invalid,
                    ToStoredDocument(document),
                    Error: applied.Error);
            }

            var newReferenceIssues = FindNewReferenceIssues(document.BodyJson, applied.BodyJson);
            if (newReferenceIssues.Count > 0)
            {
                return new ObjectMutationSaveResult(
                    ObjectMutationSaveStatus.ReferenceConflict,
                    ToStoredDocument(document),
                    Error: "Mutation would create dangling active references.",
                    ReferenceIssues: newReferenceIssues);
            }

            var timestampRevision = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var nextRevision = Math.Max(timestampRevision, document.Revision + 1);
            var nowUtc = DateTimeOffset.UtcNow;
            var changedObjects = applied.Objects
                .Select(item => item with { Revision = nextRevision })
                .ToList();

            document.BodyJson = NormalizeJson(applied.BodyJson);
            document.Revision = nextRevision;
            document.UpdatedAt = nowUtc;

            db.Mutations.Add(new SyncMutation
            {
                DocumentId = command.DocumentId,
                ClientId = command.ClientId,
                MutationId = command.MutationId,
                BaseRevision = command.BaseRevision,
                ResultingRevision = nextRevision,
                OperationType = "object.mutate",
                OperationJson = SerializeOperations(command.Operations),
                CreatedAt = nowUtc,
            });

            await DocumentObjectIndexer.ApplyIndexAsync(
                db,
                command.DocumentId,
                document.BodyJson,
                nextRevision,
                nowUtc,
                cancellationToken);

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return new ObjectMutationSaveResult(
                ObjectMutationSaveStatus.Saved,
                ToStoredDocument(document),
                command.MutationId,
                changedObjects);
        }
        finally
        {
            _writeGate.Release();
        }
    }

    private async Task<StoredDocument> EnsureObjectIndexAsync(
        string documentId,
        CancellationToken cancellationToken)
    {
        await using var readDb = await dbFactory.CreateDbContextAsync(cancellationToken);
        var hasObjectIndex = await readDb.DocumentObjects
            .AsNoTracking()
            .AnyAsync(x => x.DocumentId == documentId, cancellationToken);
        var existing = await readDb.Documents
            .AsNoTracking()
            .FirstAsync(x => x.Id == documentId, cancellationToken);

        if (hasObjectIndex) return ToStoredDocument(existing);

        await _writeGate.WaitAsync(cancellationToken);
        try
        {
            await using var writeDb = await dbFactory.CreateDbContextAsync(cancellationToken);
            var document = await writeDb.Documents
                .FirstAsync(x => x.Id == documentId, cancellationToken);
            var stillMissingObjectIndex = !await writeDb.DocumentObjects
                .AsNoTracking()
                .AnyAsync(x => x.DocumentId == documentId, cancellationToken);

            if (stillMissingObjectIndex)
            {
                await DocumentObjectIndexer.ApplyIndexAsync(
                    writeDb,
                    document.Id,
                    document.BodyJson,
                    document.Revision,
                    document.UpdatedAt,
                    cancellationToken);
                await writeDb.SaveChangesAsync(cancellationToken);
            }

            return ToStoredDocument(document);
        }
        finally
        {
            _writeGate.Release();
        }
    }

    private static StoredDocument ToStoredDocument(SyncDocument document) =>
        new(document.Id, document.Kind, document.Revision, document.BodyJson);

    private static string NormalizeJson(string value)
    {
        try
        {
            using var parsed = JsonDocument.Parse(value);
            return parsed.RootElement.GetRawText();
        }
        catch (JsonException)
        {
            return "{}";
        }
    }

    private static List<DocumentReferenceIssue> FindNewReferenceIssues(string currentBodyJson, string nextBodyJson)
    {
        var currentIssueKeys = DocumentReferenceValidator.FindIssues(currentBodyJson)
            .Select(ReferenceIssueKey)
            .ToHashSet();

        return DocumentReferenceValidator.FindIssues(nextBodyJson)
            .Where(issue => !currentIssueKeys.Contains(ReferenceIssueKey(issue)))
            .ToList();
    }

    private static string ReferenceIssueKey(DocumentReferenceIssue issue) =>
        string.Join('\u001f', issue.Code, issue.SourcePath, issue.ReferencedObjectType, issue.ReferencedObjectId);

    private static async Task<List<DocumentObjectMutationConflict>> FindObjectMutationConflictsAsync(
        SyncDbContext db,
        ObjectMutationSaveCommand command,
        SyncDocument document,
        IReadOnlyList<DocumentObjectMutationDescriptor> descriptors,
        CancellationToken cancellationToken)
    {
        var conflicts = new List<DocumentObjectMutationConflict>();
        var documentRevisionChanged = command.BaseRevision != document.Revision;

        if (command.BaseRevision <= 0)
        {
            return descriptors
                .Select(descriptor => CreateConflict(
                    "base-revision-required",
                    descriptor,
                    descriptor.BaseObjectRevision,
                    null,
                    "baseRevision is required."))
                .ToList();
        }

        var targets = descriptors
            .GroupBy(descriptor => (descriptor.ObjectType, descriptor.ObjectId))
            .ToList();

        if (!documentRevisionChanged
            && targets.All(target => target.All(descriptor => descriptor.BaseObjectRevision is null)))
        {
            return conflicts;
        }

        var objectTypes = targets
            .Select(target => target.Key.ObjectType)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        var objectRows = await db.DocumentObjects
            .AsNoTracking()
            .Where(row => row.DocumentId == command.DocumentId && objectTypes.Contains(row.ObjectType))
            .ToListAsync(cancellationToken);
        var objectRowsByKey = objectRows.ToDictionary(
            row => (row.ObjectType, row.ObjectId),
            row => row);

        var baseObjectRevisions = descriptors
            .Where(descriptor => descriptor.BaseObjectRevision is not null)
            .Select(descriptor => descriptor.BaseObjectRevision!.Value)
            .ToList();
        var minBaseObjectRevision = baseObjectRevisions.Count == 0 ? document.Revision : baseObjectRevisions.Min();
        var recentMutations = await db.Mutations
            .AsNoTracking()
            .Where(mutation => mutation.DocumentId == command.DocumentId
                && mutation.ResultingRevision > minBaseObjectRevision
                && mutation.ResultingRevision <= document.Revision)
            .OrderBy(mutation => mutation.ResultingRevision)
            .ToListAsync(cancellationToken);

        foreach (var target in targets)
        {
            var targetDescriptors = target.ToList();
            var explicitBaseRevisions = targetDescriptors
                .Where(descriptor => descriptor.BaseObjectRevision is not null)
                .Select(descriptor => descriptor.BaseObjectRevision!.Value)
                .Distinct()
                .ToList();

            if (explicitBaseRevisions.Count > 1)
            {
                conflicts.Add(CreateConflict(
                    "mixed-base-object-revision",
                    targetDescriptors[0],
                    null,
                    null,
                    "Operations for the same object must use one baseObjectRevision."));
                continue;
            }

            if (explicitBaseRevisions.Count == 0)
            {
                if (!documentRevisionChanged) continue;

                conflicts.Add(CreateConflict(
                    "base-object-revision-required",
                    targetDescriptors[0],
                    null,
                    null,
                    "baseObjectRevision is required when baseRevision is stale."));
                continue;
            }

            var baseObjectRevision = explicitBaseRevisions[0];
            objectRowsByKey.TryGetValue(target.Key, out var row);

            if (row is null)
            {
                if (baseObjectRevision == 0 && targetDescriptors.All(descriptor => descriptor.Type == "restoreObject"))
                {
                    continue;
                }

                conflicts.Add(CreateConflict(
                    "object-missing",
                    targetDescriptors[0],
                    baseObjectRevision,
                    null,
                    $"{target.Key.ObjectType} \"{target.Key.ObjectId}\" does not exist."));
                continue;
            }

            if (row.Revision < baseObjectRevision)
            {
                conflicts.Add(CreateConflict(
                    "future-base-object-revision",
                    targetDescriptors[0],
                    baseObjectRevision,
                    row.Revision,
                    "baseObjectRevision is newer than the current object revision."));
                continue;
            }

            if (row.Revision == baseObjectRevision)
            {
                if (row.DeletedAt is not null && targetDescriptors.Any(descriptor => descriptor.Type != "restoreObject"))
                {
                    conflicts.Add(CreateConflict(
                        "object-deleted",
                        targetDescriptors[0],
                        baseObjectRevision,
                        row.Revision,
                        $"{target.Key.ObjectType} \"{target.Key.ObjectId}\" is deleted."));
                }

                continue;
            }

            var explainedChange = false;
            foreach (var mutation in recentMutations.Where(mutation =>
                mutation.ResultingRevision > baseObjectRevision
                && mutation.ResultingRevision <= row.Revision))
            {
                if (mutation.OperationType != "object.mutate")
                {
                    explainedChange = true;
                    conflicts.Add(CreateConflict(
                        "unknown-object-change",
                        targetDescriptors[0],
                        baseObjectRevision,
                        row.Revision,
                        $"{target.Key.ObjectType} \"{target.Key.ObjectId}\" changed through a full snapshot."));
                    break;
                }

                if (!TryDescribeStoredMutation(mutation, out var remoteDescriptors))
                {
                    explainedChange = true;
                    conflicts.Add(CreateConflict(
                        "unknown-object-change",
                        targetDescriptors[0],
                        baseObjectRevision,
                        row.Revision,
                        $"{target.Key.ObjectType} \"{target.Key.ObjectId}\" changed through an unknown mutation."));
                    break;
                }

                var remoteTargetDescriptors = remoteDescriptors
                    .Where(remote => remote.ObjectType == target.Key.ObjectType
                        && remote.ObjectId == target.Key.ObjectId)
                    .ToList();
                if (remoteTargetDescriptors.Count == 0) continue;

                explainedChange = true;
                var conflict = FindPathConflict(targetDescriptors, remoteTargetDescriptors, baseObjectRevision, row.Revision);
                if (conflict is not null)
                {
                    conflicts.Add(conflict);
                    break;
                }
            }

            if (!explainedChange)
            {
                conflicts.Add(CreateConflict(
                    "object-changed",
                    targetDescriptors[0],
                    baseObjectRevision,
                    row.Revision,
                    $"{target.Key.ObjectType} \"{target.Key.ObjectId}\" changed since baseObjectRevision."));
            }
        }

        return conflicts;
    }

    private static bool TryDescribeStoredMutation(
        SyncMutation mutation,
        out IReadOnlyList<DocumentObjectMutationDescriptor> descriptors)
    {
        descriptors = [];
        try
        {
            var operations = JsonSerializer.Deserialize<List<DocumentObjectMutationOperation>>(
                mutation.OperationJson,
                JsonOptions);
            if (operations is null) return false;
            return DocumentObjectMutator.TryDescribeOperations(operations, out descriptors, out _);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static DocumentObjectMutationConflict? FindPathConflict(
        IReadOnlyList<DocumentObjectMutationDescriptor> localDescriptors,
        IReadOnlyList<DocumentObjectMutationDescriptor> remoteDescriptors,
        long baseObjectRevision,
        long currentObjectRevision)
    {
        foreach (var local in localDescriptors)
        {
            foreach (var remote in remoteDescriptors)
            {
                if (!PathsOverlap(local, remote)) continue;

                return CreateConflict(
                    "same-path-conflict",
                    local,
                    baseObjectRevision,
                    currentObjectRevision,
                    $"{local.ObjectType} \"{local.ObjectId}\" path \"{FormatPath(local.Path)}\" changed since baseObjectRevision.");
            }
        }

        return null;
    }

    private static bool PathsOverlap(DocumentObjectMutationDescriptor left, DocumentObjectMutationDescriptor right)
    {
        if (left.IsWholeObject || right.IsWholeObject) return true;
        return IsPrefix(left.Path, right.Path) || IsPrefix(right.Path, left.Path);
    }

    private static bool IsPrefix(IReadOnlyList<string> prefix, IReadOnlyList<string> value)
    {
        if (prefix.Count > value.Count) return false;
        for (var index = 0; index < prefix.Count; index += 1)
        {
            if (!string.Equals(prefix[index], value[index], StringComparison.Ordinal)) return false;
        }

        return true;
    }

    private static DocumentObjectMutationConflict CreateConflict(
        string code,
        DocumentObjectMutationDescriptor descriptor,
        long? baseObjectRevision,
        long? currentObjectRevision,
        string message) => new(
            code,
            descriptor.ObjectType,
            descriptor.ObjectId,
            descriptor.Path,
            baseObjectRevision,
            currentObjectRevision,
            message);

    private static string FormatPath(IReadOnlyList<string> path) =>
        path.Count == 0 ? "<object>" : string.Join(".", path);

    private static string SerializeOperations(IReadOnlyList<DocumentObjectMutationOperation> operations)
    {
        var array = new JsonArray();
        foreach (var operation in operations)
        {
            var item = new JsonObject
            {
                ["type"] = operation.Type,
                ["objectType"] = operation.ObjectType,
                ["objectId"] = operation.ObjectId,
            };

            if (operation.Path is not null)
            {
                var path = new JsonArray();
                foreach (var segment in operation.Path)
                {
                    path.Add(segment);
                }

                item["path"] = path;
            }

            if (operation.Value.ValueKind != JsonValueKind.Undefined)
            {
                item["value"] = operation.Value.ValueKind == JsonValueKind.Null
                    ? null
                    : JsonNode.Parse(operation.Value.GetRawText());
            }

            if (operation.Index is not null) item["index"] = operation.Index.Value;
            if (operation.BaseObjectRevision is not null) item["baseObjectRevision"] = operation.BaseObjectRevision.Value;

            array.Add(item);
        }

        return array.ToJsonString(JsonOptions);
    }
}
