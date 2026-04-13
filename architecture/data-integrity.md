# Data Integrity

## Preventing Data Duplication

A single sensor reading could be ingested by multiple Public Ingestion Nodes. Every reading is assigned a deterministic, content-based ID.

1. **Unique ID Generation:** `reading_id = sha256(device_id + timestamp + reading_type + value)`
2. **Deduplication:** Both Producer and Consumer ClickHouse databases use `reading_id` as primary key (ReplacingMergeTree).

## Ensuring Archive Integrity

1. **Signature preservation:** Ed25519 signatures are stored in ClickHouse alongside every reading (`signature`, `ingester_id`, `key_version` columns) and carried through to Parquet archives. This is the primary defence against bad data injection — every reading can be traced back to the ingester that signed it.
2. **Self-contained archives:** Each archive bundles a trust snapshot (public keys) and signed manifest, enabling offline verification without live infrastructure. A researcher can download an archive and verify every reading's signature using only the bundled trust data.
3. **Content-addressing (BLAKE3):** Archives stored in the archive replicator are content-addressed. Identical data always produces the same hash. This provides immutability — once archived, data cannot be modified without changing the hash. If a second archiver independently processes the same readings and produces the same BLAKE3 hash, the data is verified by definition. No separate consensus protocol is needed.
4. **Deterministic content hash:** `readings_hash` = SHA-256 of sorted reading IDs. Because reading IDs are content-based hashes, independent archivers processing the same data produce the same `readings_hash`. This enables implicit verification in the rare case where multiple archivers process overlapping data.
5. **Trust model:** In practice, most data paths have a single ingester and a single archiver. The signing chain (ingester signs reading → signature stored in ClickHouse → signature in Parquet → trust snapshot in archive) provides end-to-end verifiability for the common case. Multi-archiver verification is a bonus when it happens (e.g. overlapping regional archivers), not a requirement.

## Transport Security

All service-to-service connections support TLS encryption, controlled by a single `TLS_ENABLED` environment variable per deployment.

**Already encrypted (no configuration needed):**

- **libp2p (OrbitDB, port 4002):** Noise protocol — automatic peer-to-peer encryption. Every libp2p connection is authenticated and encrypted at the transport layer.
- **iroh-gossip (Archive replicator, P2P replication):** Built-in encryption for archive announcements between stations.

**Opt-in TLS (activated via environment variables):**

- **MQTT (EMQX):** Native MQTTS on port 8883 and WSS on port 8084. Sensors, ingesters, and Respiro connect via TLS when enabled.
- **HTTP services (Storage broker, archive replicator, ClickHouse, OrbitDB HTTP API, Zenoh API, Respiro):** Each service accepts TLS certificate and key paths via environment variables. Uvicorn (Python), axum/rustls (Rust), and Node.js all have native TLS support.
- **Zenoh (live data transport):** Native TLS support for router and peer connections.

**Certificate model:**

Each deployment uses its own CA certificate and per-service certificates. No default CA is shipped with the project (the project is open source — a shared default CA private key would be meaningless). Two options:

1. **Quick start:** Run `scripts/generate-certs.sh` to generate a unique self-signed CA and per-service certificates for your deployment. The `certs/` directory starts empty; the script populates it.
2. **Bring your own:** Place your own CA and service cert/key files in `certs/` (e.g., from a corporate PKI or Let's Encrypt). Skip the generation script.

All services within the deployment share the same CA for mutual trust. Services acting as clients (ingesters, storage broker, Respiro) load the CA certificate to verify server connections. This requires no external certificate authority, no renewals, and no DNS — consistent with the decentralization principle that no paid infrastructure or external dependencies are required.

**Defence in depth:** Ed25519 signatures on every reading provide data-level authenticity regardless of transport encryption. TLS protects against network-level eavesdropping and tampering. Both layers are independent — a reading's signature remains verifiable even if intercepted in transit, and TLS prevents interception in the first place.

## Handling Schema Evolution

The ClickHouse schema evolves through non-breaking `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations with default values. Old code continues reading old columns; new columns are invisible to code that doesn't use them. This is critical because stations across the P2P network may be running different versions simultaneously.

### Automated Migration System

Schema migrations are applied automatically on every container start — operators just run `docker compose pull && docker compose restart` and the database updates itself.

**How it works:**

1. Numbered `.sql` files in `wesense/clickhouse/migrations/` contain idempotent schema changes
2. A `wesense.schema_migrations` table in ClickHouse tracks which migrations have been applied
3. `migrate.sh` runs in the background after ClickHouse starts, scans the migrations directory, skips any already recorded, and applies the rest in order
4. Each migration is recorded in `schema_migrations` on success

**Migration file format:**

```sql
-- Migration 005: Add data_license column for per-reading license tracking

ALTER TABLE wesense.sensor_readings
    ADD COLUMN IF NOT EXISTS data_license LowCardinality(String) DEFAULT 'CC-BY-4.0';
```

Files are named `NNN_description.sql` where `NNN` is a zero-padded sequence number. All statements must be idempotent (`ADD COLUMN IF NOT EXISTS`, `MODIFY COLUMN`) as a safety net.

**Fresh installs vs existing deployments:**

- **Fresh install:** `01-create-tables.sql` creates the full schema (including all columns) via `docker-entrypoint-initdb.d`. `migrate.sh` then runs all migrations as no-ops and records them in `schema_migrations`.
- **Existing deployment:** `01-create-tables.sql` doesn't re-run (data directory isn't empty). `migrate.sh` creates `schema_migrations` (empty), runs all migrations in order — historical ones are no-ops since columns already exist, new ones apply the changes.

Both paths produce the same result: all columns present, all migrations recorded.

**Adding a new migration:**

1. Create `wesense/clickhouse/migrations/NNN_description.sql` with idempotent ALTER statements
2. Add the same column to `wesense/clickhouse/init/01-create-tables.sql` (for fresh installs)
3. Update the storage broker model, column list, and row builder if the new column flows through the ingestion pipeline
4. Commit. On next `docker compose pull && docker compose restart`, all stations get the change automatically.

### Migrations Applied

| Migration | Columns Added | Purpose |
|---|---|---|
| 001 | `deployment_type_source`, `node_info`, `node_info_url` | Deployment classification metadata |
| 002 | `signature`, `ingester_id`, `key_version` | Ed25519 signing for archive integrity |
| 003 | `received_via` | Track local vs P2P origin |
| 004 | `data_source_name` + default fixes | Human-readable source labels, fix stale defaults |
| 005 | `data_license` | Per-reading license tracking (default CC-BY-4.0) |

### Archive Schema Versioning

Parquet archives include a schema version in the manifest (e.g., `v1.0`, `v1.1`). OrbitDB entries include `schema_version`. Schema-aware consumers check the version before importing and skip unsupported versions. Archives are immutable — they're written once with the schema version at the time of archival. Old archives without newer columns (e.g., `data_license`) are still valid; consumers treat missing columns as defaults.

### Signing Payload Versioning

Changes to which fields are included in the Ed25519 signing payload require a version bump (v1 → v2). Old signatures remain valid under their declared version. The trust snapshot in each archive records which payload version each ingester used, so verification knows which fields to check.

## Node Version Compatibility

Stations across the P2P network will inevitably run different software versions. The architecture handles version skew through:

1. **Additive-only schema changes** — New columns have defaults. A station running older code ignores columns it doesn't know about. Readings from newer stations are accepted; the unknown fields simply use defaults.

2. **Self-describing archives** — Each Parquet archive carries its own schema and trust snapshot. A consumer doesn't need to know what version of the software produced it — the archive contains everything needed to interpret it.

3. **Protocol-level compatibility** — MQTT topics and Zenoh key expressions are stable. The message payload (JSON) is extensible: new fields are added, existing fields are never removed or renamed. Consumers that don't recognise a field ignore it.

4. **OrbitDB schema tolerance** — OrbitDB documents are schema-free. New fields in node registrations or trust entries are ignored by older code.
