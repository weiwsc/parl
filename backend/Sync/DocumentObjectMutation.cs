using System.Text.Json;
using System.Text.Json.Nodes;

namespace ParliamentApi.Sync;

public sealed record ObjectMutationSaveCommand(
    string DocumentId,
    string Kind,
    string ClientId,
    string MutationId,
    long BaseRevision,
    IReadOnlyList<DocumentObjectMutationOperation> Operations);

public sealed record DocumentObjectMutationOperation(
    string? Type,
    string? ObjectType,
    string? ObjectId,
    IReadOnlyList<string>? Path,
    JsonElement Value,
    int? Index,
    long? BaseObjectRevision);

public enum ObjectMutationSaveStatus
{
    Saved,
    Duplicate,
    Conflict,
    Invalid,
    ReferenceConflict,
}

public sealed record ObjectMutationSaveResult(
    ObjectMutationSaveStatus Status,
    StoredDocument Document,
    string? AcceptedMutationId = null,
    IReadOnlyList<MutatedDocumentObject>? Objects = null,
    string? Error = null,
    IReadOnlyList<DocumentReferenceIssue>? ReferenceIssues = null,
    IReadOnlyList<DocumentObjectMutationConflict>? Conflicts = null);

public sealed record MutatedDocumentObject(
    string ObjectType,
    string ObjectId,
    long Revision,
    bool Deleted);

public sealed record DocumentObjectMutationConflict(
    string Code,
    string ObjectType,
    string ObjectId,
    IReadOnlyList<string> Path,
    long? BaseObjectRevision,
    long? CurrentObjectRevision,
    string Message);

internal static class DocumentObjectCatalog
{
    private static readonly DocumentObjectArrayPath[] Paths =
    [
        new("stratum", ["strata"]),
        new("faction", ["factions"]),
        new("alliance", ["alliances"]),
        new("law", ["laws"]),
        new("lawHistory", ["lawHistory"]),
        new("event", ["events"]),
        new("eventIssue", ["eventSettings", "issues"]),
        new("electionHistory", ["history"]),
        new("region", ["map", "regions"]),
        new("nodeType", ["nodes", "types"]),
        new("nodeGraphNode", ["nodes", "graph", "nodes"]),
        new("nodeGraphConnection", ["nodes", "graph", "connections"]),
        new("nodeTransform", ["nodes", "transforms"]),
        new("senateHistory", ["senate", "history"]),
        new("trashStratum", ["trash", "strata"]),
        new("trashFaction", ["trash", "factions"]),
        new("trashAlliance", ["trash", "alliances"]),
        new("trashRegion", ["trash", "regions"]),
        new("trashElection", ["trash", "elections"]),
    ];

    private static readonly Dictionary<string, DocumentObjectArrayPath> PathsByObjectType = Paths
        .ToDictionary(path => path.ObjectType, StringComparer.Ordinal);

    public static IReadOnlyList<DocumentObjectArrayPath> ObjectArrayPaths => Paths;

    public static string[] IndexedObjectTypes { get; } = Paths
        .Select(path => path.ObjectType)
        .ToArray();

    public static bool TryGetArrayPath(string objectType, out string[] path)
    {
        if (PathsByObjectType.TryGetValue(objectType, out var objectPath))
        {
            path = objectPath.JsonPath;
            return true;
        }

        path = [];
        return false;
    }
}

internal sealed record DocumentObjectArrayPath(string ObjectType, string[] JsonPath);

internal static class DocumentObjectMutator
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static bool TryDescribeOperations(
        IReadOnlyList<DocumentObjectMutationOperation> operations,
        out IReadOnlyList<DocumentObjectMutationDescriptor> descriptors,
        out string? error)
    {
        var result = new List<DocumentObjectMutationDescriptor>();
        descriptors = result;
        error = null;

        foreach (var operation in operations)
        {
            var type = (operation.Type ?? "").Trim();
            var objectType = (operation.ObjectType ?? "").Trim();
            var objectId = (operation.ObjectId ?? "").Trim();
            if (string.IsNullOrWhiteSpace(type))
            {
                error = "Operation type is required.";
                return false;
            }

            if (string.IsNullOrWhiteSpace(objectType))
            {
                error = "objectType is required.";
                return false;
            }

            if (string.IsNullOrWhiteSpace(objectId))
            {
                error = "objectId is required.";
                return false;
            }

            if (!DocumentObjectCatalog.TryGetArrayPath(objectType, out _))
            {
                error = $"Unknown objectType \"{objectType}\".";
                return false;
            }

            var isWholeObject = type is "replaceObject" or "deleteObject" or "restoreObject";
            if (!TryGetMutationPath(operation, requirePath: !isWholeObject, out var path, out error))
            {
                return false;
            }

            if (type is not ("set" or "unset" or "insert" or "remove" or "replaceObject" or "deleteObject" or "restoreObject"))
            {
                error = $"Unsupported operation type \"{type}\".";
                return false;
            }

            result.Add(new DocumentObjectMutationDescriptor(
                operation,
                type,
                objectType,
                objectId,
                path,
                isWholeObject,
                operation.BaseObjectRevision));
        }

        return true;
    }

    public static DocumentObjectMutationApplyResult Apply(
        string bodyJson,
        IReadOnlyList<DocumentObjectMutationOperation> operations)
    {
        JsonObject? root;
        try
        {
            root = JsonNode.Parse(bodyJson) as JsonObject;
        }
        catch (JsonException)
        {
            return DocumentObjectMutationApplyResult.Fail("Document JSON is invalid.");
        }

        if (root is null)
        {
            return DocumentObjectMutationApplyResult.Fail("Document JSON must be an object.");
        }

        var touched = new Dictionary<(string ObjectType, string ObjectId), bool>();
        if (!TryDescribeOperations(operations, out var descriptors, out var error))
        {
            return DocumentObjectMutationApplyResult.Fail(error);
        }

        foreach (var descriptor in descriptors)
        {
            var operation = descriptor.Operation;
            var type = descriptor.Type;
            var objectType = descriptor.ObjectType;
            var objectId = descriptor.ObjectId;
            if (!DocumentObjectCatalog.TryGetArrayPath(objectType, out var arrayPath))
            {
                return DocumentObjectMutationApplyResult.Fail($"Unknown objectType \"{objectType}\".");
            }

            var result = type switch
            {
                "set" => ApplySet(root, arrayPath, objectType, objectId, operation),
                "unset" => ApplyUnset(root, arrayPath, objectType, objectId, operation),
                "insert" => ApplyInsert(root, arrayPath, objectType, objectId, operation),
                "remove" => ApplyRemove(root, arrayPath, objectType, objectId, operation),
                "replaceObject" => ApplyReplaceObject(root, arrayPath, objectType, objectId, operation),
                "deleteObject" => ApplyDeleteObject(root, arrayPath, objectType, objectId),
                "restoreObject" => ApplyRestoreObject(root, arrayPath, objectType, objectId, operation),
                _ => OperationResult.Fail($"Unsupported operation type \"{type}\"."),
            };

            if (!result.Success) return DocumentObjectMutationApplyResult.Fail(result.Error ?? "Mutation failed.");

            touched[(objectType, objectId)] = type == "deleteObject";
        }

        var objects = touched
            .Select(item => new MutatedDocumentObject(item.Key.ObjectType, item.Key.ObjectId, 0, item.Value))
            .ToList();
        return new DocumentObjectMutationApplyResult(true, root.ToJsonString(JsonOptions), objects, null);
    }

    private static OperationResult ApplySet(
        JsonObject root,
        string[] arrayPath,
        string objectType,
        string objectId,
        DocumentObjectMutationOperation operation)
    {
        if (!TryGetMutationPath(operation, requirePath: true, out var path, out var error)) return OperationResult.Fail(error);
        if (PathTouchesObjectId(path)) return OperationResult.Fail("Object id cannot be changed through a path mutation.");
        if (!TryReadValue(operation, out var value, out error)) return OperationResult.Fail(error);
        if (!TryGetActiveObject(root, arrayPath, objectType, objectId, out var target, out error)) return OperationResult.Fail(error);
        return SetAtPath(target, path, value);
    }

    private static OperationResult ApplyUnset(
        JsonObject root,
        string[] arrayPath,
        string objectType,
        string objectId,
        DocumentObjectMutationOperation operation)
    {
        if (!TryGetMutationPath(operation, requirePath: true, out var path, out var error)) return OperationResult.Fail(error);
        if (PathTouchesObjectId(path)) return OperationResult.Fail("Object id cannot be changed through a path mutation.");
        if (!TryGetActiveObject(root, arrayPath, objectType, objectId, out var target, out error)) return OperationResult.Fail(error);
        return RemoveAtPath(target, path);
    }

    private static OperationResult ApplyInsert(
        JsonObject root,
        string[] arrayPath,
        string objectType,
        string objectId,
        DocumentObjectMutationOperation operation)
    {
        if (!TryGetMutationPath(operation, requirePath: true, out var path, out var error)) return OperationResult.Fail(error);
        if (PathTouchesObjectId(path)) return OperationResult.Fail("Object id cannot be changed through a path mutation.");
        if (!TryReadValue(operation, out var value, out error)) return OperationResult.Fail(error);
        if (!TryGetActiveObject(root, arrayPath, objectType, objectId, out var target, out error)) return OperationResult.Fail(error);
        if (!TryResolveNode(target, path, out var node, out error)) return OperationResult.Fail(error);
        if (node is not JsonArray array) return OperationResult.Fail($"Path \"{FormatPath(path)}\" is not an array.");

        var index = operation.Index ?? array.Count;
        if (index < 0 || index > array.Count) return OperationResult.Fail("Insert index is out of range.");
        array.Insert(index, value);
        return OperationResult.Ok();
    }

    private static OperationResult ApplyRemove(
        JsonObject root,
        string[] arrayPath,
        string objectType,
        string objectId,
        DocumentObjectMutationOperation operation)
    {
        if (!TryGetMutationPath(operation, requirePath: true, out var path, out var error)) return OperationResult.Fail(error);
        if (PathTouchesObjectId(path)) return OperationResult.Fail("Object id cannot be changed through a path mutation.");
        if (!TryGetActiveObject(root, arrayPath, objectType, objectId, out var target, out error)) return OperationResult.Fail(error);

        if (operation.Index is not null)
        {
            if (!TryResolveNode(target, path, out var node, out error)) return OperationResult.Fail(error);
            if (node is not JsonArray array) return OperationResult.Fail($"Path \"{FormatPath(path)}\" is not an array.");
            if (operation.Index < 0 || operation.Index >= array.Count) return OperationResult.Fail("Remove index is out of range.");
            array.RemoveAt(operation.Index.Value);
            return OperationResult.Ok();
        }

        return RemoveAtPath(target, path);
    }

    private static OperationResult ApplyReplaceObject(
        JsonObject root,
        string[] arrayPath,
        string objectType,
        string objectId,
        DocumentObjectMutationOperation operation)
    {
        if (!TryReadObjectValue(operation, objectId, out var value, out var error)) return OperationResult.Fail(error);
        if (!TryGetObjectArray(root, arrayPath, create: false, out var array, out error)) return OperationResult.Fail(error);

        var index = FindObjectIndex(array, objectId);
        if (index < 0) return OperationResult.Fail($"{objectType} \"{objectId}\" was not found.");

        array[index] = value;
        return OperationResult.Ok();
    }

    private static OperationResult ApplyDeleteObject(
        JsonObject root,
        string[] arrayPath,
        string objectType,
        string objectId)
    {
        if (!TryGetObjectArray(root, arrayPath, create: false, out var array, out var error)) return OperationResult.Fail(error);

        var index = FindObjectIndex(array, objectId);
        if (index < 0) return OperationResult.Fail($"{objectType} \"{objectId}\" was not found.");

        array.RemoveAt(index);
        return OperationResult.Ok();
    }

    private static OperationResult ApplyRestoreObject(
        JsonObject root,
        string[] arrayPath,
        string objectType,
        string objectId,
        DocumentObjectMutationOperation operation)
    {
        if (!TryReadObjectValue(operation, objectId, out var value, out var error)) return OperationResult.Fail(error);
        if (!TryGetObjectArray(root, arrayPath, create: true, out var array, out error)) return OperationResult.Fail(error);

        var index = FindObjectIndex(array, objectId);
        if (index >= 0) return OperationResult.Fail($"{objectType} \"{objectId}\" is already active.");

        array.Add(value);
        return OperationResult.Ok();
    }

    private static bool TryGetActiveObject(
        JsonObject root,
        string[] arrayPath,
        string objectType,
        string objectId,
        out JsonObject target,
        out string? error)
    {
        target = [];
        if (!TryGetObjectArray(root, arrayPath, create: false, out var array, out error)) return false;

        var index = FindObjectIndex(array, objectId);
        if (index < 0)
        {
            error = $"{objectType} \"{objectId}\" was not found.";
            return false;
        }

        if (array[index] is JsonObject obj)
        {
            target = obj;
            return true;
        }

        error = $"{objectType} \"{objectId}\" is not a JSON object.";
        return false;
    }

    private static bool TryGetObjectArray(
        JsonObject root,
        IReadOnlyList<string> path,
        bool create,
        out JsonArray array,
        out string? error)
    {
        error = null;
        array = [];
        JsonObject current = root;

        for (var i = 0; i < path.Count - 1; i += 1)
        {
            var segment = path[i];
            if (current[segment] is null && create)
            {
                current[segment] = new JsonObject();
            }

            if (current[segment] is not JsonObject next)
            {
                error = $"Document path \"{FormatPath(path.Take(i + 1))}\" is not an object.";
                return false;
            }

            current = next;
        }

        var arrayName = path[^1];
        if (current[arrayName] is null && create)
        {
            current[arrayName] = new JsonArray();
        }

        if (current[arrayName] is not JsonArray found)
        {
            error = $"Document path \"{FormatPath(path)}\" is not an array.";
            return false;
        }

        array = found;
        return true;
    }

    private static int FindObjectIndex(JsonArray array, string objectId)
    {
        for (var i = 0; i < array.Count; i += 1)
        {
            if (array[i] is not JsonObject obj) continue;
            if (ReadStringProperty(obj, "id") == objectId) return i;
        }

        return -1;
    }

    private static OperationResult SetAtPath(JsonObject target, IReadOnlyList<string> path, JsonNode? value)
    {
        if (!TryResolveParent(target, path, out var parent, out var lastSegment, out var error))
        {
            return OperationResult.Fail(error);
        }

        if (parent is JsonObject parentObject)
        {
            parentObject[lastSegment] = value;
            return OperationResult.Ok();
        }

        if (parent is JsonArray parentArray)
        {
            if (!TryParseArrayIndex(lastSegment, parentArray.Count, allowEnd: false, out var index, out error))
            {
                return OperationResult.Fail(error);
            }

            parentArray[index] = value;
            return OperationResult.Ok();
        }

        return OperationResult.Fail($"Path parent \"{FormatPath(path.SkipLast(1))}\" is not an object or array.");
    }

    private static OperationResult RemoveAtPath(JsonObject target, IReadOnlyList<string> path)
    {
        if (!TryResolveParent(target, path, out var parent, out var lastSegment, out var error))
        {
            return OperationResult.Fail(error);
        }

        if (parent is JsonObject parentObject)
        {
            parentObject.Remove(lastSegment);
            return OperationResult.Ok();
        }

        if (parent is JsonArray parentArray)
        {
            if (!TryParseArrayIndex(lastSegment, parentArray.Count, allowEnd: false, out var index, out error))
            {
                return OperationResult.Fail(error);
            }

            parentArray.RemoveAt(index);
            return OperationResult.Ok();
        }

        return OperationResult.Fail($"Path parent \"{FormatPath(path.SkipLast(1))}\" is not an object or array.");
    }

    private static bool TryResolveParent(
        JsonNode root,
        IReadOnlyList<string> path,
        out JsonNode parent,
        out string lastSegment,
        out string? error)
    {
        parent = root;
        lastSegment = "";
        error = null;

        if (path.Count == 0)
        {
            error = "Path is required.";
            return false;
        }

        if (path.Count == 1)
        {
            lastSegment = path[0];
            return true;
        }

        if (!TryResolveNode(root, path.Take(path.Count - 1).ToArray(), out parent, out error))
        {
            return false;
        }

        lastSegment = path[^1];
        return true;
    }

    private static bool TryResolveNode(
        JsonNode root,
        IReadOnlyList<string> path,
        out JsonNode node,
        out string? error)
    {
        node = root;
        error = null;

        foreach (var segment in path)
        {
            if (node is JsonObject obj)
            {
                if (obj[segment] is not { } child)
                {
                    error = $"Path \"{FormatPath(path)}\" was not found.";
                    return false;
                }

                node = child;
                continue;
            }

            if (node is JsonArray array)
            {
                if (!TryParseArrayIndex(segment, array.Count, allowEnd: false, out var index, out error))
                {
                    return false;
                }

                if (array[index] is not { } child)
                {
                    error = $"Path \"{FormatPath(path)}\" was not found.";
                    return false;
                }

                node = child;
                continue;
            }

            error = $"Path \"{FormatPath(path)}\" cannot be resolved through a scalar value.";
            return false;
        }

        return true;
    }

    private static bool TryGetMutationPath(
        DocumentObjectMutationOperation operation,
        bool requirePath,
        out string[] path,
        out string? error)
    {
        path = (operation.Path ?? [])
            .Select(segment => segment.Trim())
            .ToArray();
        error = null;

        if (path.Any(string.IsNullOrWhiteSpace))
        {
            error = "Path cannot contain empty segments.";
            return false;
        }

        if (requirePath && path.Length == 0)
        {
            error = "Path is required.";
            return false;
        }

        return true;
    }

    private static bool TryReadValue(
        DocumentObjectMutationOperation operation,
        out JsonNode? value,
        out string? error)
    {
        value = null;
        error = null;

        if (operation.Value.ValueKind == JsonValueKind.Undefined)
        {
            error = "value is required.";
            return false;
        }

        value = JsonNode.Parse(operation.Value.GetRawText());
        return true;
    }

    private static bool TryReadObjectValue(
        DocumentObjectMutationOperation operation,
        string objectId,
        out JsonObject value,
        out string? error)
    {
        value = [];
        if (!TryReadValue(operation, out var node, out error)) return false;

        if (node is not JsonObject obj)
        {
            error = "value must be a JSON object.";
            return false;
        }

        var valueId = ReadStringProperty(obj, "id");
        if (string.IsNullOrWhiteSpace(valueId))
        {
            error = "value.id is required.";
            return false;
        }

        if (!string.Equals(valueId, objectId, StringComparison.Ordinal))
        {
            error = "value.id must match objectId.";
            return false;
        }

        value = obj;
        return true;
    }

    private static bool TryParseArrayIndex(
        string segment,
        int count,
        bool allowEnd,
        out int index,
        out string? error)
    {
        error = null;
        if (!int.TryParse(segment, out index))
        {
            error = $"Array path segment \"{segment}\" is not a valid index.";
            return false;
        }

        var max = allowEnd ? count : count - 1;
        if (index < 0 || index > max)
        {
            error = "Array index is out of range.";
            return false;
        }

        return true;
    }

    private static bool PathTouchesObjectId(IReadOnlyList<string> path) =>
        path.Count > 0 && string.Equals(path[0], "id", StringComparison.Ordinal);

    private static string? ReadStringProperty(JsonObject obj, string propertyName)
    {
        if (!obj.TryGetPropertyValue(propertyName, out var node)) return null;
        return node is JsonValue value && value.TryGetValue<string>(out var parsed) ? parsed : null;
    }

    private static string FormatPath(IEnumerable<string> path) =>
        string.Join(".", path);

    private sealed record OperationResult(bool Success, string? Error)
    {
        public static OperationResult Ok() => new(true, null);
        public static OperationResult Fail(string? error) => new(false, error);
    }
}

internal sealed record DocumentObjectMutationApplyResult(
    bool Success,
    string BodyJson,
    IReadOnlyList<MutatedDocumentObject> Objects,
    string? Error)
{
    public static DocumentObjectMutationApplyResult Fail(string? error) => new(false, "{}", [], error);
}

internal sealed record DocumentObjectMutationDescriptor(
    DocumentObjectMutationOperation Operation,
    string Type,
    string ObjectType,
    string ObjectId,
    IReadOnlyList<string> Path,
    bool IsWholeObject,
    long? BaseObjectRevision);
