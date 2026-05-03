using System.Data;
using System.Text.Json;
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

        if (existing is not null) return ToStoredDocument(existing);

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
}
