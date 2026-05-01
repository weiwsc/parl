using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ── Config from environment ────────────────────────────────────────────────
var adminUser = builder.Configuration["ADMIN_USER"] ?? "admin";
var adminPass = builder.Configuration["ADMIN_PASS"] ?? "parliament";
var jwtKeyRaw  = builder.Configuration["JWT_KEY"]   ?? "parliament-default-dev-key-must-be-32ch";
var dataPath   = builder.Configuration["DATA_PATH"]  ?? "data/state.json";
var jwtKey     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKeyRaw.PadRight(32)[..32]));

// ── JWT auth ───────────────────────────────────────────────────────────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => {
        o.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtKey,
            ValidateIssuer   = false,
            ValidateAudience = false,
        };
    });
builder.Services.AddAuthorization();

// ── CORS (development) ─────────────────────────────────────────────────────
builder.Services.AddCors(o => o.AddPolicy("DevCors",
    b => b.WithOrigins("http://localhost:5173", "http://localhost:4173")
          .AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();

app.UseCors("DevCors");
app.UseAuthentication();
app.UseAuthorization();

// Serve React static build (wwwroot/ in production container)
app.UseStaticFiles();

// ── Helpers ────────────────────────────────────────────────────────────────
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(dataPath))!);

string ReadState()         => File.Exists(dataPath) ? File.ReadAllText(dataPath) : "{}";
void   WriteState(string s) => File.WriteAllText(dataPath, s);

// ── API endpoints ──────────────────────────────────────────────────────────

// Public: anyone can read state
app.MapGet("/api/state", () =>
    Results.Content(ReadState(), "application/json"));

// Admin: update state
app.MapPut("/api/state", async (HttpRequest req) => {
    using var sr = new StreamReader(req.Body);
    WriteState(await sr.ReadToEndAsync());
    return Results.NoContent();
}).RequireAuthorization();

// Auth: login → returns JWT
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

// SPA fallback (React Router)
app.MapFallbackToFile("index.html");

app.Run();

record LoginRequest(string Username, string Password);
