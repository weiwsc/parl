using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
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

var databaseDirectory = Path.GetDirectoryName(Path.GetFullPath(databasePath));
if (!string.IsNullOrWhiteSpace(databaseDirectory)) Directory.CreateDirectory(databaseDirectory);

var sqliteConnection = new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString();

// ── Services ──────────────────────────────────────────────────────────────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => {
        o.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtKey,
            ValidateIssuer = false,
            ValidateAudience = false,
        };
    });
builder.Services.AddAuthorization();
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
    using var parsed = JsonDocument.Parse(document.BodyJson);
    var payload = new DocumentEnvelope(
        document.Id,
        document.Revision,
        clientId,
        mutationId,
        duplicate,
        parsed.RootElement.Clone());
    return JsonSerializer.Serialize(payload, jsonOptions);
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
}).RequireAuthorization();

// Public: Server-Sent Events stream for a document.
// Sends current snapshot immediately, then streams accepted writes.
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

// Auth: exchange credentials for a JWT.
app.MapPost("/api/auth/login", (LoginRequest req) => {
    if (req.Username != adminUser || req.Password != adminPass)
        return Results.Unauthorized();

    var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor {
        Claims = new Dictionary<string, object> { ["role"] = "admin" },
        Expires = DateTime.UtcNow.AddDays(7),
        SigningCredentials = new SigningCredentials(jwtKey, SecurityAlgorithms.HmacSha256),
    });
    return Results.Ok(new { token });
});

app.MapFallbackToFile("index.html");
app.Run();

record LoginRequest(string Username, string Password);
record SnapshotRequest(string? clientId, string? mutationId, long baseRevision, JsonElement document);
record DocumentEnvelope(
    string documentId,
    long revision,
    string? clientId,
    string? mutationId,
    bool duplicate,
    JsonElement document);
record SseClient(string DocumentId, Channel<string> Channel);
