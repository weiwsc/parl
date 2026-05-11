using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using ParliamentApi.Sync;

var tests = new (string Name, Func<Task> Run)[]
{
    ("indexes stable objects and soft-deletes missing objects", Tests.IndexesStableObjectsAndSoftDeletesMissingObjects),
    ("rejects object deletes that create dangling references", Tests.RejectsObjectDeletesThatCreateDanglingReferences),
};

var failures = 0;
foreach (var test in tests)
{
    try
    {
        await test.Run();
        Console.WriteLine($"PASS {test.Name}");
    }
    catch (Exception ex)
    {
        failures += 1;
        Console.Error.WriteLine($"FAIL {test.Name}");
        Console.Error.WriteLine(ex);
    }
}

if (failures > 0)
{
    Console.Error.WriteLine($"{failures} test(s) failed.");
    return 1;
}

Console.WriteLine($"{tests.Length} test(s) passed.");
return 0;

static class Tests
{
    public static async Task IndexesStableObjectsAndSoftDeletesMissingObjects()
    {
        await using var fixture = await StoreFixture.CreateAsync();
        var store = new EfDocumentStore(fixture.Factory);

        var initial = await store.GetOrCreateAsync(
            "main",
            "app-state",
            """
            {
              "schemaVersion": 3,
              "strata": [{ "id": "s1", "name": "Workers" }],
              "factions": [{ "id": "f1", "name": "Labor", "color": "#cc0000" }],
              "alliances": [],
              "map": { "regions": [{ "id": "r1", "name": "Capital" }] },
              "eventSettings": { "issues": [] },
              "nodes": { "types": [], "graph": { "nodes": [], "connections": [] }, "transforms": [] },
              "trash": { "strata": [], "factions": [], "alliances": [], "regions": [], "elections": [] },
              "history": [],
              "laws": [],
              "lawHistory": [],
              "events": [],
              "senate": { "history": [] }
            }
            """,
            CancellationToken.None);

        await using (var db = fixture.CreateDbContext())
        {
            var faction = await db.DocumentObjects.FindAsync(["main", "faction", "f1"], CancellationToken.None);
            Assert.NotNull(faction, "Expected faction f1 to be indexed.");
            Assert.Equal(initial.Revision, faction!.Revision, "Indexed faction revision should match document revision.");
            Assert.JsonStringProperty(faction.BodyJson, "name", "Labor", "Indexed faction body should contain the faction name.");

            var region = await db.DocumentObjects.FindAsync(["main", "region", "r1"], CancellationToken.None);
            Assert.NotNull(region, "Expected region r1 to be indexed.");
        }

        var saved = await store.SaveSnapshotAsync(
            new SnapshotSaveCommand(
                "main",
                "app-state",
                "test-client",
                "remove-faction",
                initial.Revision,
                """
                {
                  "schemaVersion": 3,
                  "strata": [{ "id": "s1", "name": "Workers" }],
                  "factions": [],
                  "alliances": [],
                  "map": { "regions": [{ "id": "r1", "name": "Capital District" }] },
                  "eventSettings": { "issues": [] },
                  "nodes": { "types": [], "graph": { "nodes": [], "connections": [] }, "transforms": [] },
                  "trash": { "strata": [], "factions": [], "alliances": [], "regions": [], "elections": [] },
                  "history": [],
                  "laws": [],
                  "lawHistory": [],
                  "events": [],
                  "senate": { "history": [] }
                }
                """),
            CancellationToken.None);

        Assert.Equal(SnapshotSaveStatus.Saved, saved.Status, "Snapshot save should be accepted.");

        await using (var db = fixture.CreateDbContext())
        {
            var deletedFaction = await db.DocumentObjects.FindAsync(["main", "faction", "f1"], CancellationToken.None);
            Assert.NotNull(deletedFaction, "Expected removed faction to keep an index row.");
            Assert.NotNull(deletedFaction!.DeletedAt, "Expected removed faction to be soft-deleted.");
            Assert.Equal(saved.Document.Revision, deletedFaction.Revision, "Soft-delete revision should match save revision.");

            var region = await db.DocumentObjects.FindAsync(["main", "region", "r1"], CancellationToken.None);
            Assert.NotNull(region, "Expected region r1 to remain indexed.");
            Assert.Null(region!.DeletedAt, "Expected existing region to remain active.");
            Assert.JsonStringProperty(region.BodyJson, "name", "Capital District", "Expected changed region body to be re-indexed.");
            Assert.Equal(saved.Document.Revision, region.Revision, "Changed region revision should match save revision.");
        }
    }

    public static async Task RejectsObjectDeletesThatCreateDanglingReferences()
    {
        await using var fixture = await StoreFixture.CreateAsync();
        var store = new EfDocumentStore(fixture.Factory);

        var initial = await store.GetOrCreateAsync(
            "main",
            "app-state",
            """
            {
              "schemaVersion": 3,
              "strata": [],
              "factions": [{ "id": "f1", "name": "Labor" }],
              "alliances": [{ "id": "a1", "name": "Coalition", "factionIds": ["f1"] }],
              "map": { "regions": [] },
              "eventSettings": { "issues": [] },
              "nodes": { "types": [], "graph": { "nodes": [], "connections": [] }, "transforms": [] },
              "trash": { "strata": [], "factions": [], "alliances": [], "regions": [], "elections": [] },
              "history": [],
              "laws": [],
              "lawHistory": [],
              "events": [],
              "senate": { "history": [] }
            }
            """,
            CancellationToken.None);

        var result = await store.SaveObjectMutationsAsync(
            new ObjectMutationSaveCommand(
                "main",
                "app-state",
                "test-client",
                "delete-faction",
                initial.Revision,
                [
                    new DocumentObjectMutationOperation(
                        "deleteObject",
                        "faction",
                        "f1",
                        null,
                        default,
                        null,
                        null),
                ]),
            CancellationToken.None);

        Assert.Equal(ObjectMutationSaveStatus.ReferenceConflict, result.Status, "Deleting referenced faction should be rejected.");
        Assert.NotEmpty(result.ReferenceIssues ?? [], "Reference conflict should report dangling references.");

        await using var db = fixture.CreateDbContext();
        var faction = await db.DocumentObjects.FindAsync(["main", "faction", "f1"], CancellationToken.None);
        Assert.NotNull(faction, "Expected faction index row to remain.");
        Assert.Null(faction!.DeletedAt, "Rejected mutation should not soft-delete the faction.");
    }
}

sealed class StoreFixture : IAsyncDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<SyncDbContext> _options;

    private StoreFixture(SqliteConnection connection, DbContextOptions<SyncDbContext> options)
    {
        _connection = connection;
        _options = options;
        Factory = new TestDbContextFactory(options);
    }

    public IDbContextFactory<SyncDbContext> Factory { get; }

    public static async Task<StoreFixture> CreateAsync()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<SyncDbContext>()
            .UseSqlite(connection)
            .Options;
        var fixture = new StoreFixture(connection, options);
        await using var db = fixture.CreateDbContext();
        await db.Database.EnsureCreatedAsync();
        return fixture;
    }

    public SyncDbContext CreateDbContext() => new(_options);

    public async ValueTask DisposeAsync()
    {
        await _connection.DisposeAsync();
    }
}

sealed class TestDbContextFactory(DbContextOptions<SyncDbContext> options) : IDbContextFactory<SyncDbContext>
{
    public SyncDbContext CreateDbContext() => new(options);
}

static class Assert
{
    public static void Equal<T>(T expected, T actual, string message)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new InvalidOperationException($"{message} Expected <{expected}> but got <{actual}>.");
        }
    }

    public static void NotEmpty<T>(IReadOnlyCollection<T> items, string message)
    {
        if (items.Count == 0) throw new InvalidOperationException(message);
    }

    public static void NotNull<T>(T? value, string message)
    {
        if (value is null) throw new InvalidOperationException(message);
    }

    public static void Null<T>(T? value, string message)
    {
        if (value is not null) throw new InvalidOperationException(message);
    }

    public static void JsonStringProperty(string json, string propertyName, string expected, string message)
    {
        using var document = System.Text.Json.JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty(propertyName, out var property)
            || property.ValueKind != System.Text.Json.JsonValueKind.String
            || property.GetString() != expected)
        {
            throw new InvalidOperationException($"{message} Expected property <{propertyName}> to be <{expected}> in <{json}>.");
        }
    }
}
