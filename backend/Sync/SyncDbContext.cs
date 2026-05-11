using Microsoft.EntityFrameworkCore;

namespace ParliamentApi.Sync;

public sealed class SyncDbContext(DbContextOptions<SyncDbContext> options) : DbContext(options)
{
    public DbSet<SyncDocument> Documents => Set<SyncDocument>();
    public DbSet<SyncDocumentObject> DocumentObjects => Set<SyncDocumentObject>();
    public DbSet<SyncMutation> Mutations => Set<SyncMutation>();
    public DbSet<PlayerAccount> PlayerAccounts => Set<PlayerAccount>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var document = modelBuilder.Entity<SyncDocument>();
        document.ToTable("sync_documents");
        document.HasKey(x => x.Id);
        document.Property(x => x.Id).HasColumnName("id").HasMaxLength(128);
        document.Property(x => x.Kind).HasColumnName("kind").HasMaxLength(64).IsRequired();
        document.Property(x => x.Revision).HasColumnName("revision").IsRequired();
        document.Property(x => x.BodyJson).HasColumnName("body_json").IsRequired();
        document.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();

        var documentObject = modelBuilder.Entity<SyncDocumentObject>();
        documentObject.ToTable("sync_document_objects");
        documentObject.HasKey(x => new { x.DocumentId, x.ObjectType, x.ObjectId });
        documentObject.Property(x => x.DocumentId).HasColumnName("document_id").HasMaxLength(128);
        documentObject.Property(x => x.ObjectType).HasColumnName("object_type").HasMaxLength(80);
        documentObject.Property(x => x.ObjectId).HasColumnName("object_id").HasMaxLength(128);
        documentObject.Property(x => x.SchemaVersion).HasColumnName("schema_version").IsRequired();
        documentObject.Property(x => x.BodyJson).HasColumnName("body_json").IsRequired();
        documentObject.Property(x => x.Revision).HasColumnName("revision").IsRequired();
        documentObject.Property(x => x.DeletedAt).HasColumnName("deleted_at");
        documentObject.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        documentObject.HasIndex(x => new { x.DocumentId, x.ObjectType });
        documentObject.HasOne(x => x.Document)
            .WithMany(x => x.Objects)
            .HasForeignKey(x => x.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        var mutation = modelBuilder.Entity<SyncMutation>();
        mutation.ToTable("sync_mutations");
        mutation.HasKey(x => x.Id);
        mutation.Property(x => x.Id).HasColumnName("id").ValueGeneratedOnAdd();
        mutation.Property(x => x.DocumentId).HasColumnName("document_id").HasMaxLength(128).IsRequired();
        mutation.Property(x => x.ClientId).HasColumnName("client_id").HasMaxLength(128).IsRequired();
        mutation.Property(x => x.MutationId).HasColumnName("mutation_id").HasMaxLength(128).IsRequired();
        mutation.Property(x => x.BaseRevision).HasColumnName("base_revision").IsRequired();
        mutation.Property(x => x.ResultingRevision).HasColumnName("resulting_revision").IsRequired();
        mutation.Property(x => x.OperationType).HasColumnName("operation_type").HasMaxLength(80).IsRequired();
        mutation.Property(x => x.OperationJson).HasColumnName("operation_json").IsRequired();
        mutation.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        mutation.HasIndex(x => new { x.DocumentId, x.ClientId, x.MutationId }).IsUnique();
        mutation.HasOne(x => x.Document)
            .WithMany(x => x.Mutations)
            .HasForeignKey(x => x.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);

        var player = modelBuilder.Entity<PlayerAccount>();
        player.ToTable("player_accounts");
        player.HasKey(x => x.Id);
        player.Property(x => x.Id).HasColumnName("id").HasMaxLength(64);
        player.Property(x => x.Username).HasColumnName("username").HasMaxLength(64).IsRequired();
        player.Property(x => x.NormalizedUsername).HasColumnName("normalized_username").HasMaxLength(64).IsRequired();
        player.Property(x => x.PasswordHash).HasColumnName("password_hash").IsRequired();
        player.Property(x => x.FactionId).HasColumnName("faction_id").HasMaxLength(128).IsRequired();
        player.Property(x => x.CreatedAt).HasColumnName("created_at").IsRequired();
        player.Property(x => x.UpdatedAt).HasColumnName("updated_at").IsRequired();
        player.HasIndex(x => x.NormalizedUsername).IsUnique();
    }
}

public sealed class SyncDocument
{
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "app-state";
    public long Revision { get; set; }
    public string BodyJson { get; set; } = "{}";
    public DateTimeOffset UpdatedAt { get; set; }
    public List<SyncDocumentObject> Objects { get; set; } = [];
    public List<SyncMutation> Mutations { get; set; } = [];
}

public sealed class SyncDocumentObject
{
    public string DocumentId { get; set; } = "";
    public string ObjectType { get; set; } = "";
    public string ObjectId { get; set; } = "";
    public int SchemaVersion { get; set; }
    public string BodyJson { get; set; } = "{}";
    public long Revision { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public SyncDocument? Document { get; set; }
}

public sealed class SyncMutation
{
    public long Id { get; set; }
    public string DocumentId { get; set; } = "";
    public string ClientId { get; set; } = "";
    public string MutationId { get; set; } = "";
    public long BaseRevision { get; set; }
    public long ResultingRevision { get; set; }
    public string OperationType { get; set; } = "";
    public string OperationJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
    public SyncDocument? Document { get; set; }
}

public sealed class PlayerAccount
{
    public string Id { get; set; } = "";
    public string Username { get; set; } = "";
    public string NormalizedUsername { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string FactionId { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
