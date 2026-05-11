using System.Text.Json;

namespace ParliamentApi.Sync;

internal sealed class JsonReferenceValidationContext
{
    private readonly List<DocumentReferenceIssue> _issues = [];

    public IReadOnlyList<DocumentReferenceIssue> Issues => _issues;

    public void CheckObjectKeyReferences(
        JsonElement sourceObject,
        ISet<string> existingIds,
        string referencedObjectType,
        string sourcePath)
    {
        foreach (var property in sourceObject.EnumerateObject())
        {
            CheckReference(property.Name, existingIds, referencedObjectType, $"{sourcePath}.{property.Name}");
        }
    }

    public void CheckStringArrayReferences(
        JsonElement sourceArray,
        ISet<string> existingIds,
        string referencedObjectType,
        string sourcePath)
    {
        var index = 0;
        foreach (var item in sourceArray.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                CheckReference(item.GetString() ?? "", existingIds, referencedObjectType, $"{sourcePath}[{index}]");
            }

            index += 1;
        }
    }

    public void CheckStringReference(
        JsonElement source,
        string propertyName,
        ISet<string> existingIds,
        string referencedObjectType,
        string sourcePath,
        bool allowEmpty = false)
    {
        var id = JsonElementReader.StringProperty(source, propertyName);
        if (allowEmpty && string.IsNullOrWhiteSpace(id)) return;
        CheckReference(id, existingIds, referencedObjectType, sourcePath);
    }

    public void CheckReference(
        string? referencedObjectId,
        ISet<string> existingIds,
        string referencedObjectType,
        string sourcePath)
    {
        if (string.IsNullOrWhiteSpace(referencedObjectId)) return;
        if (existingIds.Contains(referencedObjectId)) return;

        _issues.Add(new DocumentReferenceIssue(
            "dangling-reference",
            "warning",
            sourcePath,
            referencedObjectType,
            referencedObjectId,
            $"{sourcePath} references missing {referencedObjectType} \"{referencedObjectId}\"."));
    }
}

internal static class JsonElementReader
{
    public static HashSet<string> CollectIds(JsonElement root, string propertyName)
    {
        if (!TryGetArray(root, [propertyName], out var array)) return [];
        return CollectIds(array);
    }

    public static HashSet<string> CollectIds(JsonElement array)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var id = StringProperty(item, "id");
            if (!string.IsNullOrWhiteSpace(id)) ids.Add(id);
        }

        return ids;
    }

    public static string? StringProperty(JsonElement source, string propertyName)
    {
        if (source.ValueKind != JsonValueKind.Object) return null;
        if (!source.TryGetProperty(propertyName, out var value)) return null;
        return value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    public static bool TryGetArray(JsonElement root, IReadOnlyList<string> path, out JsonElement array)
    {
        if (TryGet(root, path, out array) && array.ValueKind == JsonValueKind.Array) return true;
        array = default;
        return false;
    }

    public static bool TryGetObject(JsonElement root, IReadOnlyList<string> path, out JsonElement obj)
    {
        if (TryGet(root, path, out obj) && obj.ValueKind == JsonValueKind.Object) return true;
        obj = default;
        return false;
    }

    public static bool TryGet(JsonElement root, IReadOnlyList<string> path, out JsonElement value)
    {
        value = root;
        foreach (var segment in path)
        {
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(segment, out value))
            {
                value = default;
                return false;
            }
        }

        return true;
    }
}

public sealed record DocumentReferenceIssue(
    string Code,
    string Severity,
    string SourcePath,
    string ReferencedObjectType,
    string ReferencedObjectId,
    string Message);
