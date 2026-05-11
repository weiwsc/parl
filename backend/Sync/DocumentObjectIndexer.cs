using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace ParliamentApi.Sync;

public static class DocumentObjectIndexer
{
    public static async Task ApplyIndexAsync(
        SyncDbContext db,
        string documentId,
        string bodyJson,
        long revision,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var extracted = Extract(bodyJson)
            .GroupBy(item => (item.ObjectType, item.ObjectId))
            .Select(group => group.Last())
            .ToList();
        var extractedByKey = extracted.ToDictionary(
            item => (item.ObjectType, item.ObjectId),
            item => item);

        var existing = await db.DocumentObjects
            .Where(item => item.DocumentId == documentId && DocumentObjectCatalog.IndexedObjectTypes.Contains(item.ObjectType))
            .ToListAsync(cancellationToken);
        var existingByKey = existing.ToDictionary(
            item => (item.ObjectType, item.ObjectId),
            item => item);

        foreach (var item in extracted)
        {
            if (existingByKey.TryGetValue((item.ObjectType, item.ObjectId), out var row))
            {
                if (row.BodyJson == item.BodyJson && row.DeletedAt is null && row.SchemaVersion == item.SchemaVersion)
                {
                    continue;
                }

                row.SchemaVersion = item.SchemaVersion;
                row.BodyJson = item.BodyJson;
                row.Revision = revision;
                row.DeletedAt = null;
                row.UpdatedAt = now;
            }
            else
            {
                db.DocumentObjects.Add(new SyncDocumentObject
                {
                    DocumentId = documentId,
                    ObjectType = item.ObjectType,
                    ObjectId = item.ObjectId,
                    SchemaVersion = item.SchemaVersion,
                    BodyJson = item.BodyJson,
                    Revision = revision,
                    UpdatedAt = now,
                });
            }
        }

        foreach (var row in existing)
        {
            if (row.DeletedAt is not null) continue;
            if (extractedByKey.ContainsKey((row.ObjectType, row.ObjectId))) continue;

            row.Revision = revision;
            row.DeletedAt = now;
            row.UpdatedAt = now;
        }
    }

    private static List<IndexedDocumentObject> Extract(string bodyJson)
    {
        using var document = JsonDocument.Parse(bodyJson);
        var root = document.RootElement;
        var schemaVersion = ReadSchemaVersion(root);
        var result = new List<IndexedDocumentObject>();

        foreach (var path in DocumentObjectCatalog.ObjectArrayPaths)
        {
            if (!TryGetArray(root, path.JsonPath, out var array)) continue;

            foreach (var item in array.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object) continue;
                if (!item.TryGetProperty("id", out var idProperty)) continue;
                if (idProperty.ValueKind != JsonValueKind.String) continue;

                var id = idProperty.GetString();
                if (string.IsNullOrWhiteSpace(id)) continue;

                result.Add(new IndexedDocumentObject(
                    path.ObjectType,
                    id,
                    ReadSchemaVersion(item, schemaVersion),
                    item.GetRawText()));
            }
        }

        return result;
    }

    private static bool TryGetArray(JsonElement root, IReadOnlyList<string> path, out JsonElement array)
    {
        var current = root;
        foreach (var segment in path)
        {
            if (current.ValueKind != JsonValueKind.Object || !current.TryGetProperty(segment, out current))
            {
                array = default;
                return false;
            }
        }

        array = current;
        return array.ValueKind == JsonValueKind.Array;
    }

    private static int ReadSchemaVersion(JsonElement value) =>
        ReadSchemaVersionOrNull(value) ?? 0;

    private static int? ReadSchemaVersionOrNull(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Object) return null;
        if (!value.TryGetProperty("schemaVersion", out var schemaVersion)) return null;
        if (schemaVersion.ValueKind != JsonValueKind.Number) return null;
        return schemaVersion.TryGetInt32(out var parsed) ? parsed : null;
    }

    private static int ReadSchemaVersion(JsonElement item, int fallback) =>
        ReadSchemaVersionOrNull(item) ?? fallback;
    private sealed record IndexedDocumentObject(
        string ObjectType,
        string ObjectId,
        int SchemaVersion,
        string BodyJson);
}
