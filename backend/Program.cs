using System.Collections.Concurrent;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using ParliamentApi.Sync;

var builder = WebApplication.CreateBuilder(args);

// ── Config ────────────────────────────────────────────────────────────────────
var adminUser = builder.Configuration["ADMIN_USER"] ?? "admin";
var adminPass = builder.Configuration["ADMIN_PASS"] ?? "parliament";
var jwtKeyRaw = builder.Configuration["JWT_KEY"] ?? "parliament-default-dev-key-must-be-32ch";
var legacyDataPath = builder.Configuration["DATA_PATH"] ?? "data/state.json";
var defaultDatabasePath = Path.Combine(
    Path.GetDirectoryName(Path.GetFullPath(legacyDataPath)) ?? "data",
    "parl.db");
var databasePath = builder.Configuration["DATABASE_PATH"] ?? defaultDatabasePath;
var jwtKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKeyRaw.PadRight(32)[..32]));

const string MainDocumentId = "main";
const string MainDocumentKind = "app-state";
const int PasswordHashIterations = 120_000;

var databaseDirectory = Path.GetDirectoryName(Path.GetFullPath(databasePath));
if (!string.IsNullOrWhiteSpace(databaseDirectory)) Directory.CreateDirectory(databaseDirectory);

var sqliteConnection = new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString();

// ── Services ──────────────────────────────────────────────────────────────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtKey,
            ValidateIssuer = false,
            ValidateAudience = false,
            RoleClaimType = "role",
        };
    });
builder.Services.AddAuthorization(o => {
    o.AddPolicy("AdminOnly", policy =>
        policy.RequireAssertion(ctx => GetRole(ctx.User) == "admin"));
    o.AddPolicy("PlayerOnly", policy =>
        policy.RequireAssertion(ctx => GetRole(ctx.User) == "player"));
});
builder.Services.AddCors(o => o.AddPolicy("DevCors",
    b => b.WithOrigins(
            "http://localhost:5173",
            "http://localhost:4173",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:4173")
          .AllowAnyMethod().AllowAnyHeader()));
builder.Services.AddDbContextFactory<SyncDbContext>(options => options.UseSqlite(sqliteConnection));
builder.Services.AddSingleton<IDocumentStore, EfDocumentStore>();

var app = builder.Build();
app.UseCors("DevCors");
app.UseAuthentication();
app.UseAuthorization();
app.UseStaticFiles();

await using (var scope = app.Services.CreateAsyncScope())
{
    var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<SyncDbContext>>();
    await using var db = await dbFactory.CreateDbContextAsync();
    await db.Database.EnsureCreatedAsync();
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS sync_document_objects (
            document_id TEXT NOT NULL,
            object_type TEXT NOT NULL,
            object_id TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            body_json TEXT NOT NULL,
            revision INTEGER NOT NULL,
            deleted_at TEXT NULL,
            updated_at TEXT NOT NULL,
            CONSTRAINT pk_sync_document_objects PRIMARY KEY (document_id, object_type, object_id),
            CONSTRAINT fk_sync_document_objects_sync_documents_document_id
                FOREIGN KEY (document_id) REFERENCES sync_documents (id) ON DELETE CASCADE
        );
        """);
    await db.Database.ExecuteSqlRawAsync("""
        CREATE INDEX IF NOT EXISTS ix_sync_document_objects_document_id_object_type
        ON sync_document_objects (document_id, object_type);
        """);
    await db.Database.ExecuteSqlRawAsync("""
        CREATE TABLE IF NOT EXISTS player_accounts (
            id TEXT NOT NULL CONSTRAINT pk_player_accounts PRIMARY KEY,
            username TEXT NOT NULL,
            normalized_username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            faction_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """);
    await db.Database.ExecuteSqlRawAsync("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_player_accounts_normalized_username
        ON player_accounts (normalized_username);
        """);
}

// ── Collaborative document sync ───────────────────────────────────────────────
var sseClients = new ConcurrentDictionary<Guid, SseClient>();
var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

string ReadInitialState()
{
    try
    {
        if (!File.Exists(legacyDataPath)) return "{}";
        var json = File.ReadAllText(legacyDataPath);
        using var parsed = JsonDocument.Parse(json);
        return parsed.RootElement.GetRawText();
    }
    catch
    {
        return "{}";
    }
}

async Task<StoredDocument> GetDocument(
    IDocumentStore documents,
    string documentId,
    CancellationToken cancellationToken)
{
    var kind = documentId == MainDocumentId ? MainDocumentKind : "document";
    return await documents.GetOrCreateAsync(documentId, kind, ReadInitialState(), cancellationToken);
}

string Envelope(
    StoredDocument document,
    string? clientId = null,
    string? mutationId = null,
    bool duplicate = false)
{
    return JsonSerializer.Serialize(DocumentEnvelopeBody(document, clientId, mutationId, duplicate), jsonOptions);
}

DocumentEnvelope DocumentEnvelopeBody(
    StoredDocument document,
    string? clientId = null,
    string? mutationId = null,
    bool duplicate = false)
{
    using var parsed = JsonDocument.Parse(document.BodyJson);
    return new DocumentEnvelope(
        document.Id,
        document.Revision,
        clientId,
        mutationId,
        duplicate,
        parsed.RootElement.Clone());
}

ObjectMutationEnvelope ObjectMutationBody(
    StoredDocument document,
    string? clientId,
    string? mutationId,
    bool duplicate,
    IReadOnlyList<MutatedDocumentObject> objects)
{
    using var parsed = JsonDocument.Parse(document.BodyJson);
    return new ObjectMutationEnvelope(
        document.Id,
        document.Revision,
        clientId,
        mutationId,
        duplicate,
        objects,
        parsed.RootElement.Clone());
}

string ObjectMutationEventPayload(
    StoredDocument document,
    string? clientId,
    string? mutationId,
    IReadOnlyList<MutatedDocumentObject> objects,
    IReadOnlyList<DocumentObjectMutationOperation> operations)
{
    var payload = new JsonObject
    {
        ["eventType"] = "object.mutate",
        ["documentId"] = document.Id,
        ["revision"] = document.Revision,
        ["clientId"] = clientId,
        ["mutationId"] = mutationId,
        ["duplicate"] = false,
        ["objects"] = MutatedObjectsJson(objects),
        ["operations"] = MutationOperationsJson(operations),
    };

    return payload.ToJsonString(jsonOptions);
}

JsonArray MutatedObjectsJson(IReadOnlyList<MutatedDocumentObject> objects)
{
    var array = new JsonArray();
    foreach (var item in objects)
    {
        array.Add(new JsonObject
        {
            ["objectType"] = item.ObjectType,
            ["objectId"] = item.ObjectId,
            ["revision"] = item.Revision,
            ["deleted"] = item.Deleted,
        });
    }

    return array;
}

JsonArray MutationOperationsJson(IReadOnlyList<DocumentObjectMutationOperation> operations)
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

    return array;
}

void Broadcast(string documentId, string payload)
{
    foreach (var (_, client) in sseClients)
    {
        if (client.DocumentId != documentId) continue;
        client.Channel.Writer.TryWrite(payload);
    }
}

// Background keep-alive: prevents proxies/load-balancers from closing idle SSE connections.
_ = Task.Run(async () => {
    while (true)
    {
        await Task.Delay(25_000);
        foreach (var (_, client) in sseClients)
        {
            client.Channel.Writer.TryWrite("__ping__");
        }
    }
});

// ── Endpoints ─────────────────────────────────────────────────────────────────

// Public: read current document snapshot.
app.MapGet("/api/documents/{documentId}", async (
    string documentId,
    HttpContext ctx,
    IDocumentStore documents) => {
    var document = await GetDocument(documents, documentId, ctx.RequestAborted);
    ctx.Response.Headers.ETag = document.Revision.ToString();
    ctx.Response.Headers.CacheControl = "no-cache, no-store";
    ctx.Response.ContentType = "application/json";
    await ctx.Response.WriteAsync(Envelope(document), ctx.RequestAborted);
});

// Admin: save a full snapshot with explicit mutation identity.
// This is the first database-backed sync step; domain operations can replace
// snapshot.replace incrementally once the node editor model settles.
app.MapPut("/api/documents/{documentId}/snapshot", async (
    string documentId,
    SnapshotRequest req,
    HttpContext ctx,
    IDocumentStore documents) => {
    if (string.IsNullOrWhiteSpace(req.clientId) || string.IsNullOrWhiteSpace(req.mutationId))
    {
        return Results.BadRequest("clientId and mutationId are required.");
    }

    if (req.document.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
    {
        return Results.BadRequest("document is required.");
    }

    var command = new SnapshotSaveCommand(
        documentId,
        documentId == MainDocumentId ? MainDocumentKind : "document",
        req.clientId.Trim(),
        req.mutationId.Trim(),
        req.baseRevision,
        req.document.GetRawText());

    var result = await documents.SaveSnapshotAsync(command, ctx.RequestAborted);
    var body = Envelope(
        result.Document,
        command.ClientId,
        result.AcceptedMutationId,
        result.Status == SnapshotSaveStatus.Duplicate);

    ctx.Response.Headers.ETag = result.Document.Revision.ToString();
    ctx.Response.ContentType = "application/json";

    if (result.Status == SnapshotSaveStatus.Conflict)
    {
        ctx.Response.StatusCode = StatusCodes.Status409Conflict;
        await ctx.Response.WriteAsync(body, ctx.RequestAborted);
        return Results.Empty;
    }

    if (result.Status == SnapshotSaveStatus.Saved)
    {
        Broadcast(documentId, body);
    }

    await ctx.Response.WriteAsync(body, ctx.RequestAborted);
    return Results.Empty;
}).RequireAuthorization("AdminOnly");

app.MapPost("/api/documents/{documentId}/objects/mutations", async (
    string documentId,
    ObjectMutationRequest req,
    HttpContext ctx,
    IDocumentStore documents) => {
    if (string.IsNullOrWhiteSpace(req.clientId) || string.IsNullOrWhiteSpace(req.mutationId))
    {
        return Results.BadRequest(new ObjectMutationErrorDto(
            "invalid-request",
            "clientId and mutationId are required.",
            null,
            [],
            []));
    }

    if (req.operations is null || req.operations.Count == 0)
    {
        return Results.BadRequest(new ObjectMutationErrorDto(
            "invalid-request",
            "At least one operation is required.",
            null,
            [],
            []));
    }

    var command = new ObjectMutationSaveCommand(
        documentId,
        documentId == MainDocumentId ? MainDocumentKind : "document",
        req.clientId.Trim(),
        req.mutationId.Trim(),
        req.baseRevision,
        req.operations);

    var result = await documents.SaveObjectMutationsAsync(command, ctx.RequestAborted);
    ctx.Response.Headers.ETag = result.Document.Revision.ToString();

    if (result.Status == ObjectMutationSaveStatus.Invalid)
    {
        return Results.BadRequest(new ObjectMutationErrorDto(
            "invalid-mutation",
            result.Error ?? "Mutation is invalid.",
            DocumentEnvelopeBody(result.Document),
            [],
            []));
    }

    if (result.Status == ObjectMutationSaveStatus.Conflict)
    {
        return Results.Conflict(new ObjectMutationErrorDto(
            "revision-conflict",
            result.Error ?? "Document changed before this mutation could be applied.",
            DocumentEnvelopeBody(result.Document),
            result.Conflicts ?? [],
            []));
    }

    if (result.Status == ObjectMutationSaveStatus.ReferenceConflict)
    {
        return Results.Conflict(new ObjectMutationErrorDto(
            "reference-conflict",
            result.Error ?? "Mutation would create dangling active references.",
            DocumentEnvelopeBody(result.Document),
            [],
            result.ReferenceIssues ?? []));
    }

    var body = ObjectMutationBody(
        result.Document,
        command.ClientId,
        result.AcceptedMutationId,
        result.Status == ObjectMutationSaveStatus.Duplicate,
        result.Objects ?? []);

    if (result.Status == ObjectMutationSaveStatus.Saved)
    {
        Broadcast(
            documentId,
            ObjectMutationEventPayload(
                result.Document,
                command.ClientId,
                result.AcceptedMutationId,
                result.Objects ?? [],
                command.Operations));
    }

    return Results.Ok(body);
}).RequireAuthorization("AdminOnly");

// Public: Server-Sent Events stream for a document.
// Sends current snapshot immediately, then streams snapshot or object-mutation writes.
app.MapGet("/api/documents/{documentId}/events", async (
    string documentId,
    HttpContext ctx,
    IDocumentStore documents) => {
    ctx.Response.Headers.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache, no-store";
    ctx.Response.Headers["X-Accel-Buffering"] = "no";

    var id = Guid.NewGuid();
    var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(16)
    {
        FullMode = BoundedChannelFullMode.DropOldest,
    });
    sseClients[id] = new SseClient(documentId, channel);

    try
    {
        var initialDocument = await GetDocument(documents, documentId, ctx.RequestAborted);
        await ctx.Response.WriteAsync($"data: {Envelope(initialDocument)}\n\n", ctx.RequestAborted);
        await ctx.Response.Body.FlushAsync(ctx.RequestAborted);

        await foreach (var msg in channel.Reader.ReadAllAsync(ctx.RequestAborted))
        {
            var line = msg == "__ping__" ? ": ping\n\n" : $"data: {msg}\n\n";
            await ctx.Response.WriteAsync(line, ctx.RequestAborted);
            await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
        }
    }
    catch (OperationCanceledException)
    {
        // Client disconnected.
    }
    finally
    {
        sseClients.TryRemove(id, out _);
    }
});

app.MapGet("/api/documents/{documentId}/objects", async (
    string documentId,
    string? objectType,
    bool? includeDeleted,
    IDbContextFactory<SyncDbContext> dbFactory,
    CancellationToken cancellationToken) => {
    await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
    var query = db.DocumentObjects
        .AsNoTracking()
        .Where(x => x.DocumentId == documentId);

    if (!string.IsNullOrWhiteSpace(objectType))
    {
        var trimmedObjectType = objectType.Trim();
        query = query.Where(x => x.ObjectType == trimmedObjectType);
    }

    if (includeDeleted != true)
    {
        query = query.Where(x => x.DeletedAt == null);
    }

    var objects = await query
        .OrderBy(x => x.ObjectType)
        .ThenBy(x => x.ObjectId)
        .Select(x => new DocumentObjectSummaryDto(
            x.DocumentId,
            x.ObjectType,
            x.ObjectId,
            x.SchemaVersion,
            x.Revision,
            x.DeletedAt,
            x.UpdatedAt))
        .ToListAsync(cancellationToken);

    return Results.Ok(objects);
}).RequireAuthorization("AdminOnly");

app.MapGet("/api/documents/{documentId}/objects/{objectType}/{objectId}", async (
    string documentId,
    string objectType,
    string objectId,
    bool? includeDeleted,
    IDbContextFactory<SyncDbContext> dbFactory,
    CancellationToken cancellationToken) => {
    await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
    var item = await db.DocumentObjects
        .AsNoTracking()
        .FirstOrDefaultAsync(
            x => x.DocumentId == documentId
              && x.ObjectType == objectType
              && x.ObjectId == objectId,
            cancellationToken);

    if (item is null || (includeDeleted != true && item.DeletedAt is not null))
    {
        return Results.NotFound();
    }

    using var parsed = JsonDocument.Parse(item.BodyJson);
    return Results.Ok(new DocumentObjectEnvelope(
        item.DocumentId,
        item.ObjectType,
        item.ObjectId,
        item.SchemaVersion,
        item.Revision,
        item.DeletedAt,
        item.UpdatedAt,
        parsed.RootElement.Clone()));
}).RequireAuthorization("AdminOnly");

app.MapPost("/api/documents/{documentId}/objects/reindex", async (
    string documentId,
    HttpContext ctx,
    IDbContextFactory<SyncDbContext> dbFactory) => {
    await using var db = await dbFactory.CreateDbContextAsync(ctx.RequestAborted);
    var document = await db.Documents
        .FirstOrDefaultAsync(x => x.Id == documentId, ctx.RequestAborted);

    if (document is null)
    {
        return Results.NotFound();
    }

    await using var transaction = await db.Database.BeginTransactionAsync(ctx.RequestAborted);
    var now = DateTimeOffset.UtcNow;
    await DocumentObjectIndexer.ApplyIndexAsync(
        db,
        document.Id,
        document.BodyJson,
        document.Revision,
        now,
        ctx.RequestAborted);
    await db.SaveChangesAsync(ctx.RequestAborted);
    await transaction.CommitAsync(ctx.RequestAborted);

    var activeCount = await db.DocumentObjects.CountAsync(
        x => x.DocumentId == documentId && x.DeletedAt == null,
        ctx.RequestAborted);
    var deletedCount = await db.DocumentObjects.CountAsync(
        x => x.DocumentId == documentId && x.DeletedAt != null,
        ctx.RequestAborted);

    return Results.Ok(new DocumentObjectReindexResponse(
        document.Id,
        document.Revision,
        activeCount,
        deletedCount,
        now));
}).RequireAuthorization("AdminOnly");

app.MapGet("/api/documents/{documentId}/references/issues", async (
    string documentId,
    HttpContext ctx,
    IDocumentStore documents) => {
    var document = await GetDocument(documents, documentId, ctx.RequestAborted);
    var issues = DocumentReferenceValidator.FindIssues(document.BodyJson);
    return Results.Ok(new DocumentReferenceReportDto(
        document.Id,
        document.Revision,
        issues.Count,
        issues));
}).RequireAuthorization("AdminOnly");

app.MapGet("/api/player-accounts", async (
    IDbContextFactory<SyncDbContext> dbFactory,
    CancellationToken cancellationToken) => {
    await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
    var accounts = await db.PlayerAccounts
        .AsNoTracking()
        .OrderBy(x => x.Username)
        .Select(x => new PlayerAccountDto(x.Id, x.Username, x.FactionId, x.CreatedAt, x.UpdatedAt))
        .ToListAsync(cancellationToken);
    return Results.Ok(accounts);
}).RequireAuthorization("AdminOnly");

app.MapPost("/api/player-accounts", async (
    PlayerAccountCreateRequest req,
    HttpContext ctx,
    IDbContextFactory<SyncDbContext> dbFactory,
    IDocumentStore documents) => {
    var username = (req.Username ?? "").Trim();
    var password = req.Password ?? "";
    var factionId = (req.FactionId ?? "").Trim();

    if (username.Length is < 2 or > 64) return Results.BadRequest("Username must be 2-64 characters.");
    if (password.Length is < 6 or > 200) return Results.BadRequest("Password must be 6-200 characters.");
    if (string.IsNullOrWhiteSpace(factionId)) return Results.BadRequest("Faction is required.");

    var document = await GetDocument(documents, MainDocumentId, ctx.RequestAborted);
    if (!DocumentHasFaction(document.BodyJson, factionId))
    {
        return Results.BadRequest("Faction does not exist.");
    }

    var normalizedUsername = NormalizeUsername(username);
    await using var db = await dbFactory.CreateDbContextAsync(ctx.RequestAborted);
    var exists = await db.PlayerAccounts
        .AsNoTracking()
        .AnyAsync(x => x.NormalizedUsername == normalizedUsername, ctx.RequestAborted);
    if (exists) return Results.Conflict("Username already exists.");

    var now = DateTimeOffset.UtcNow;
    var account = new PlayerAccount
    {
        Id = Guid.NewGuid().ToString("N"),
        Username = username,
        NormalizedUsername = normalizedUsername,
        PasswordHash = HashPassword(password),
        FactionId = factionId,
        CreatedAt = now,
        UpdatedAt = now,
    };

    db.PlayerAccounts.Add(account);
    await db.SaveChangesAsync(ctx.RequestAborted);

    return Results.Created(
        $"/api/player-accounts/{account.Id}",
        new PlayerAccountDto(account.Id, account.Username, account.FactionId, account.CreatedAt, account.UpdatedAt));
}).RequireAuthorization("AdminOnly");

app.MapDelete("/api/player-accounts/{id}", async (
    string id,
    IDbContextFactory<SyncDbContext> dbFactory,
    CancellationToken cancellationToken) => {
    await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
    var account = await db.PlayerAccounts.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
    if (account is null) return Results.NotFound();

    db.PlayerAccounts.Remove(account);
    await db.SaveChangesAsync(cancellationToken);
    return Results.NoContent();
}).RequireAuthorization("AdminOnly");

app.MapPost("/api/law-stance", async (
    PlayerLawStanceRequest req,
    HttpContext ctx,
    IDocumentStore documents) => {
    var factionId = ctx.User.FindFirstValue("factionId");
    var accountId = ctx.User.FindFirstValue("playerAccountId") ?? "player";
    if (string.IsNullOrWhiteSpace(factionId)) return Results.Forbid();

    var stance = (req.Stance ?? "").Trim();
    var chamber = (req.Chamber ?? "").Trim();
    if (stance is not ("support" or "abstain" or "against"))
        return Results.BadRequest("Invalid stance.");
    if (chamber is not ("parliament" or "senate"))
        return Results.BadRequest("Invalid chamber.");
    if (string.IsNullOrWhiteSpace(req.LawId))
        return Results.BadRequest("Law is required.");

    for (var attempt = 0; attempt < 3; attempt += 1)
    {
        var document = await GetDocument(documents, MainDocumentId, ctx.RequestAborted);
        if (!DocumentHasFaction(document.BodyJson, factionId)) return Results.Forbid();

        var nextBody = ApplyLawStance(document.BodyJson, req.LawId.Trim(), chamber, factionId, stance, out var error);
        if (nextBody is null)
        {
            return error == "Law not found" ? Results.NotFound(error) : Results.BadRequest(error);
        }

        var mutationId = string.IsNullOrWhiteSpace(req.MutationId)
            ? $"stance-{Guid.NewGuid():N}"
            : req.MutationId.Trim();
        var result = await documents.SaveSnapshotAsync(new SnapshotSaveCommand(
            MainDocumentId,
            MainDocumentKind,
            $"player:{accountId}",
            mutationId,
            document.Revision,
            nextBody), ctx.RequestAborted);

        if (result.Status == SnapshotSaveStatus.Conflict) continue;

        var body = Envelope(
            result.Document,
            $"player:{accountId}",
            result.AcceptedMutationId,
            result.Status == SnapshotSaveStatus.Duplicate);

        if (result.Status == SnapshotSaveStatus.Saved)
        {
            Broadcast(MainDocumentId, body);
        }

        ctx.Response.Headers.ETag = result.Document.Revision.ToString();
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync(body, ctx.RequestAborted);
        return Results.Empty;
    }

    return Results.Conflict("Document changed while voting. Try again.");
}).RequireAuthorization("PlayerOnly");

// Auth: exchange credentials for an admin or player JWT.
app.MapPost("/api/auth/login", async (
    LoginRequest req,
    IDbContextFactory<SyncDbContext> dbFactory,
    CancellationToken cancellationToken) => {
    var username = (req.Username ?? "").Trim();
    var password = req.Password ?? "";

    if (username == adminUser && password == adminPass)
    {
        var token = CreateToken(new Dictionary<string, object>
        {
            ["role"] = "admin",
            ["username"] = adminUser,
        });
        return Results.Ok(new AuthResponse(token, "admin", adminUser, null));
    }

    await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
    var normalizedUsername = NormalizeUsername(username);
    var player = await db.PlayerAccounts
        .AsNoTracking()
        .FirstOrDefaultAsync(x => x.NormalizedUsername == normalizedUsername, cancellationToken);

    if (player is null || !VerifyPassword(password, player.PasswordHash))
    {
        return Results.Unauthorized();
    }

    var playerToken = CreateToken(new Dictionary<string, object>
    {
        ["role"] = "player",
        ["username"] = player.Username,
        ["playerAccountId"] = player.Id,
        ["factionId"] = player.FactionId,
    });

    return Results.Ok(new AuthResponse(playerToken, "player", player.Username, player.FactionId));
});

app.MapFallbackToFile("index.html");
app.Run();

string CreateToken(IReadOnlyDictionary<string, object> claims) =>
    new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor {
        Claims = new Dictionary<string, object>(claims),
        Expires = DateTime.UtcNow.AddDays(7),
        SigningCredentials = new SigningCredentials(jwtKey, SecurityAlgorithms.HmacSha256),
    });

string? GetRole(ClaimsPrincipal user) =>
    user.FindFirstValue("role") ?? user.FindFirstValue(ClaimTypes.Role);

string NormalizeUsername(string value) => value.Trim().ToUpperInvariant();

string HashPassword(string password)
{
    var salt = RandomNumberGenerator.GetBytes(16);
    var hash = Rfc2898DeriveBytes.Pbkdf2(
        password,
        salt,
        PasswordHashIterations,
        HashAlgorithmName.SHA256,
        32);
    return string.Join('$',
        "pbkdf2-sha256",
        PasswordHashIterations.ToString(),
        Convert.ToBase64String(salt),
        Convert.ToBase64String(hash));
}

bool VerifyPassword(string password, string storedHash)
{
    var parts = storedHash.Split('$');
    if (parts.Length != 4 || parts[0] != "pbkdf2-sha256") return false;
    if (!int.TryParse(parts[1], out var iterations) || iterations < 10_000) return false;

    try
    {
        var salt = Convert.FromBase64String(parts[2]);
        var expected = Convert.FromBase64String(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
    catch (FormatException)
    {
        return false;
    }
}

bool DocumentHasFaction(string bodyJson, string factionId)
{
    try
    {
        using var document = JsonDocument.Parse(bodyJson);
        if (!document.RootElement.TryGetProperty("factions", out var factions)
            || factions.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        foreach (var faction in factions.EnumerateArray())
        {
            if (faction.ValueKind == JsonValueKind.Object
                && faction.TryGetProperty("id", out var id)
                && id.GetString() == factionId)
            {
                return true;
            }
        }
    }
    catch (JsonException)
    {
        return false;
    }

    return false;
}

string? ApplyLawStance(
    string bodyJson,
    string lawId,
    string chamber,
    string factionId,
    string stance,
    out string error)
{
    error = "";

    JsonObject? root;
    try
    {
        root = JsonNode.Parse(bodyJson) as JsonObject;
    }
    catch (JsonException)
    {
        error = "Document is invalid.";
        return null;
    }

    if (root is null)
    {
        error = "Document is invalid.";
        return null;
    }

    if (root["laws"] is not JsonArray laws)
    {
        error = "Law not found";
        return null;
    }

    JsonObject? law = null;
    foreach (var item in laws)
    {
        if (item is JsonObject candidate
            && string.Equals(candidate["id"]?.GetValue<string>(), lawId, StringComparison.Ordinal))
        {
            law = candidate;
            break;
        }
    }

    if (law is null)
    {
        error = "Law not found";
        return null;
    }

    var stanceProperty = chamber == "senate" ? "senateFactionStances" : "factionStances";
    if (law[stanceProperty] is not JsonObject stances)
    {
        stances = new JsonObject();
        law[stanceProperty] = stances;
    }

    stances[factionId] = stance;
    return root.ToJsonString(jsonOptions);
}

record LoginRequest(string? Username, string? Password);
record AuthResponse(string Token, string Role, string Username, string? FactionId);
record PlayerAccountCreateRequest(string? Username, string? Password, string? FactionId);
record PlayerAccountDto(string Id, string Username, string FactionId, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
record PlayerLawStanceRequest(string? LawId, string? Chamber, string? Stance, string? MutationId);
record SnapshotRequest(string? clientId, string? mutationId, long baseRevision, JsonElement document);
record ObjectMutationRequest(
    string? clientId,
    string? mutationId,
    long baseRevision,
    IReadOnlyList<DocumentObjectMutationOperation>? operations);
record ObjectMutationEnvelope(
    string documentId,
    long revision,
    string? clientId,
    string? mutationId,
    bool duplicate,
    IReadOnlyList<MutatedDocumentObject> objects,
    JsonElement document);
record ObjectMutationErrorDto(
    string Code,
    string Message,
    DocumentEnvelope? CurrentDocument,
    IReadOnlyList<DocumentObjectMutationConflict> ObjectConflicts,
    IReadOnlyList<DocumentReferenceIssue> ReferenceIssues);
record DocumentObjectSummaryDto(
    string DocumentId,
    string ObjectType,
    string ObjectId,
    int SchemaVersion,
    long Revision,
    DateTimeOffset? DeletedAt,
    DateTimeOffset UpdatedAt);
record DocumentObjectEnvelope(
    string DocumentId,
    string ObjectType,
    string ObjectId,
    int SchemaVersion,
    long Revision,
    DateTimeOffset? DeletedAt,
    DateTimeOffset UpdatedAt,
    JsonElement Body);
record DocumentObjectReindexResponse(
    string DocumentId,
    long Revision,
    int ActiveObjectCount,
    int DeletedObjectCount,
    DateTimeOffset ReindexedAt);
record DocumentReferenceReportDto(
    string DocumentId,
    long Revision,
    int IssueCount,
    IReadOnlyList<DocumentReferenceIssue> Issues);
record DocumentEnvelope(
    string documentId,
    long revision,
    string? clientId,
    string? mutationId,
    bool duplicate,
    JsonElement document);
record SseClient(string DocumentId, Channel<string> Channel);
