using System.Collections.Concurrent;
using System.Text;
using System.Threading.Channels;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ── Config ────────────────────────────────────────────────────────────────────
var adminUser = builder.Configuration["ADMIN_USER"] ?? "admin";
var adminPass = builder.Configuration["ADMIN_PASS"] ?? "parliament";
var jwtKeyRaw = builder.Configuration["JWT_KEY"]   ?? "parliament-default-dev-key-must-be-32ch";
var dataPath  = builder.Configuration["DATA_PATH"]  ?? "data/state.json";
var jwtKey    = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKeyRaw.PadRight(32)[..32]));

// ── Services ──────────────────────────────────────────────────────────────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => {
        o.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = jwtKey,
            ValidateIssuer           = false,
            ValidateAudience         = false,
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddCors(o => o.AddPolicy("DevCors",
    b => b.WithOrigins("http://localhost:5173", "http://localhost:4173")
          .AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();
app.UseCors("DevCors");
app.UseAuthentication();
app.UseAuthorization();
app.UseStaticFiles();

// ── Collaborative state store ─────────────────────────────────────────────────
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(dataPath))!);

var stateLock  = new ReaderWriterLockSlim();
var sseClients = new ConcurrentDictionary<Guid, Channel<string>>();
var revision   = 1;   // in-memory revision counter; resets on server restart (that's fine)

// Thread-safe read — returns (json, currentRevision)
(string json, int rev) ReadState() {
    stateLock.EnterReadLock();
    try   { return (File.Exists(dataPath) ? File.ReadAllText(dataPath) : "{}", revision); }
    finally { stateLock.ExitReadLock(); }
}

// Thread-safe conditional write.
// clientRev == 0  → bypass optimistic check (first write after server restart)
// Returns new revision on success, -1 on conflict.
int TryWrite(string newJson, int clientRev) {
    stateLock.EnterWriteLock();
    try {
        if (clientRev > 0 && clientRev != revision) return -1;
        File.WriteAllText(dataPath, newJson);
        return ++revision;
    } finally {
        stateLock.ExitWriteLock();
    }
}

// Push a payload to every connected SSE client.
void Broadcast(string payload) {
    foreach (var (_, ch) in sseClients)
        ch.Writer.TryWrite(payload);   // non-blocking; DropOldest handles backpressure
}

// SSE envelope: { "rev": N, "state": <raw state JSON> }
// We inline the raw JSON so it is never double-serialised.
string Envelope(string stateJson, int rev) => $"{{\"rev\":{rev},\"state\":{stateJson}}}";

// Background keep-alive: prevents proxies/load-balancers from closing idle SSE connections.
_ = Task.Run(async () => {
    while (true) {
        await Task.Delay(25_000);
        foreach (var (_, ch) in sseClients)
            ch.Writer.TryWrite("__ping__");
    }
});

// ── Endpoints ─────────────────────────────────────────────────────────────────

// Public: read current state (ETag = current revision)
app.MapGet("/api/state", async (HttpContext ctx) => {
    var (json, rev) = ReadState();
    ctx.Response.Headers.ETag       = rev.ToString();
    ctx.Response.Headers.CacheControl = "no-cache, no-store";
    ctx.Response.ContentType        = "application/json";
    await ctx.Response.WriteAsync(json);
});

// Admin: update state with optimistic concurrency via If-Match header.
// 204 → accepted (ETag = new revision)
// 409 → conflict; body = current server state envelope so client can rebase
app.MapPut("/api/state", async (HttpContext ctx) => {
    int.TryParse(ctx.Request.Headers.IfMatch.ToString(), out int clientRev);

    using var sr     = new StreamReader(ctx.Request.Body);
    var       newJson = await sr.ReadToEndAsync();

    var newRev = TryWrite(newJson, clientRev);
    if (newRev < 0) {
        // Conflict: another editor saved a newer revision.
        var (cur, curRev) = ReadState();
        ctx.Response.StatusCode       = 409;
        ctx.Response.Headers.ETag     = curRev.ToString();
        ctx.Response.ContentType      = "application/json";
        await ctx.Response.WriteAsync(Envelope(cur, curRev));
        return;
    }

    // Success: broadcast to every connected browser.
    Broadcast(Envelope(newJson, newRev));
    ctx.Response.StatusCode   = 204;
    ctx.Response.Headers.ETag = newRev.ToString();
}).RequireAuthorization();

// Public: Server-Sent Events stream.
// Sends current state immediately on connect, then streams changes in real time.
// Note: if behind Cloudflare, set the route to bypass caching (CF Cache-Control: no-cache).
app.MapGet("/api/state/events", async (HttpContext ctx) => {
    ctx.Response.Headers["Content-Type"]      = "text/event-stream";
    ctx.Response.Headers["Cache-Control"]     = "no-cache, no-store";
    ctx.Response.Headers["X-Accel-Buffering"] = "no";   // disable nginx buffering

    var id      = Guid.NewGuid();
    var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(16) {
        FullMode = BoundedChannelFullMode.DropOldest,   // never block the writer
    });
    sseClients[id] = channel;

    try {
        // Immediately send current state so the client is up to date on connect.
        var (initJson, initRev) = ReadState();
        await ctx.Response.WriteAsync($"data: {Envelope(initJson, initRev)}\n\n");
        await ctx.Response.Body.FlushAsync(ctx.RequestAborted);

        // Stream subsequent updates until the client disconnects.
        await foreach (var msg in channel.Reader.ReadAllAsync(ctx.RequestAborted)) {
            var line = msg == "__ping__" ? ": ping\n\n" : $"data: {msg}\n\n";
            await ctx.Response.WriteAsync(line, ctx.RequestAborted);
            await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
        }
    } catch (OperationCanceledException) {
        // Client disconnected — normal, not an error.
    } finally {
        sseClients.TryRemove(id, out _);
    }
});

// Auth: exchange credentials for a JWT
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
