# Data Integrity

## Preventing Data Duplication

A single sensor reading could be ingested by multiple Public Ingestion Nodes. Every reading is assigned a deterministic, content-based ID.

1. **Unique ID Generation:** `reading_id = sha256(device_id + timestamp + reading_type + value)`
2. **Deduplication:** Both Producer and Consumer ClickHouse databases use `reading_id` as primary key (ReplacingMergeTree).

## Dual-Path Identity Invariant

A reading's signed identity must be identical regardless of which path it travels:

1. **Archive path:** Ingester → storage broker → ClickHouse → Parquet → iroh blob
2. **Live path:** Ingester → MQTT → live transport → Zenoh → remote station → remote ClickHouse → remote Parquet → remote iroh blob

If the payloads differ between paths, remote stations produce archives with different content hashes than the originating station. Iroh treats them as different blobs, deduplication fails, and storage doubles.

**The rule:** Every field that forms part of the archived, content-addressed record must be present in the reading from the moment it leaves the ingester. The `ReadingSigner` signs a canonical JSON containing all archivable fields. That identical signed payload is sent to both MQTT and the storage broker. The live transport preserves the original signature — it does not re-sign.

**The result:** A reading that travels the live path produces a byte-identical, signature-identical archive blob to the same reading travelling the archive path. Content addressing works. Dedup works. One reading, one identity, one signature, everywhere.

### Canonical Reading

The canonical reading is the set of fields that are signed, archived, and content-addressed. These fields are defined in `wesense-ingester-core` and are the same for every ingester:

| Field | Type | Description |
|---|---|---|
| `signing_payload_version` | int | Which canonical schema was used to build the signed bytes (starts at 1, frozen) |
| `device_id` | str | Unique device identifier |
| `timestamp` | int | Unix epoch seconds from sensor |
| `reading_type` | str | Standardised type (e.g. `pm2_5`) |
| `reading_type_name` | str | Human-readable display name (e.g. `PM2.5`) |
| `value` | float | The measurement |
| `unit` | str | Unit string |
| `latitude` | float | Decimal degrees |
| `longitude` | float | Decimal degrees |
| `altitude` | float or null | Metres above sea level |
| `data_source` | str | Origin identifier (lowercase) |
| `data_source_name` | str | Human-readable origin name |
| `sensor_transport` | str | First-hop connection |
| `geo_country` | str | ISO 3166-1 alpha-2 |
| `geo_subdivision` | str | ISO 3166-2 |
| `board_model` | str | Hardware model |
| `sensor_model` | str | Sensor IC model |
| `calibration_status` | str | Calibration state |
| `deployment_type` | str | Indoor/outdoor/mixed |
| `deployment_type_source` | str | How deployment_type was determined |
| `node_name` | str | Human-readable device name |
| `node_info` | str | Physical setup description |
| `node_info_url` | str | Documentation link |
| `location_source` | str | How coordinates were obtained |
| `data_license` | str | Data license (default CC-BY-4.0) |

**`signing_payload_version` is part of the signed payload, not metadata alongside it.** Including the version inside the canonical reading cryptographically binds the version label to the data. An attacker cannot relabel a v1 signed reading as "v2" to trick a verifier — the signature covers the version value itself, so any mismatch fails verification.

Fields NOT in the canonical reading (operational metadata that varies by station):
- `network_source` — whether received locally or via P2P
- `ingestion_node_id` — which station processed it
- `received_via` — local or p2p
- `signature`, `ingester_id`, `key_version` — these travel alongside the canonical reading but are not part of it (the signature signs the canonical reading, not itself)

### Canonical Determinism Contract

**Every implementation that produces canonical JSON for the same input must produce byte-identical output.** This is non-negotiable. Signatures span decades and cross-language boundaries. If a Python ingester signed a reading in 2026 and a Rust ingester in 2030 wants to verify it, both must reproduce the exact same bytes to compute or check the signature.

The contract has three layers — all three must be honoured by every implementation in every language.

**1. JSON serialisation rules (cross-language standard):**

- Object keys sorted lexicographically (`sort_keys=True` in Python)
- No whitespace — `{"a":1,"b":2}` not `{"a": 1, "b": 2}`
- UTF-8 encoded output bytes
- Strings use minimal JSON escaping (only `"`, `\`, and control characters escaped)
- Integers: plain digits, no leading zeros, no `.0` (e.g., `1712000000` not `1712000000.0`)
- Floats: **shortest round-trip representation per IEEE 754** (Grisu/Ryu algorithm). This is the default in Python 3 `json.dumps`, Rust `{}` formatter, Go `strconv.FormatFloat`, JavaScript `JSON.stringify`, and most modern languages. It means `22.5` → `"22.5"`, `0.1 + 0.2` → `"0.30000000000000004"`, and any IEEE 754 double has exactly one string representation.
- Booleans: `true`/`false` (lowercase)
- Null: `null`

**2. Canonical value rules (what the ingester provides):**

- `timestamp` is always an integer Unix epoch seconds from the sensor (not the ingester receive time)
- All string fields are strings, never null — if absent, use empty string `""`
- `latitude`, `longitude`, `altitude` are floats or `null`, never strings
- `value` is always a float, never null
- `signing_payload_version` is an integer

**3. Ingester preprocessing contract (same inputs → same bytes):**

The canonical builder does not alter numeric values — it only enforces type coercion (`float(x)`). **Any precision-altering arithmetic happens in the ingester before handing the reading to the pipeline**, and two ingesters ingesting the same physical sensor reading must apply the same preprocessing.

Concrete rules:

- **Ingester-level rounding.** If an ingester rounds values for any reason (bandwidth, sensor precision, standardisation), it must use the same rounding rules as the reference Python ingester. See `wesense-ingester-wesense/main.py` `READING_DECIMALS` for the current table — e.g., `temperature` rounds to 2 decimal places, `pm2_5` to 1, `co2` to integer. Python uses banker's rounding (half-to-even) via `round()`. Other languages must match this when implementing the same sensor decoder.
- **Lat/lon precision.** The WeSense firmware transmits `latitude_e5 / longitude_e5` as integers at 1e-5 precision (decimetre-level), and the ingester converts via `value / 100000.0`. This division is exact in IEEE 754 for all valid inputs, so any language produces identical floats.
- **No silent coercion in the pipeline.** `build_canonical_v1` does not round, truncate, or otherwise modify numeric values. What the ingester passes is what gets signed.

**The consequence: two implementations of the same ingester (Python now, Rust later) must be validated against a fixed set of inputs that produce fixed canonical bytes.** The reference test vectors live in `wesense-ingester-core/tests/test_pipeline.py`. Any new implementation must pass the same vectors before being trusted in the network.

**What this means in practice:**

- You cannot add a second Rust ingester for a sensor type that the Python ingester already handles, unless the Rust ingester produces byte-identical canonical output for the same sensor reading. If it doesn't, their archives diverge and the Dual-Path Identity Invariant breaks.
- You CAN add a Rust ingester for a new sensor type that Python doesn't handle. The canonical bytes depend only on that ingester's output; there's no cross-ingester collision.
- You can port an existing Python ingester to another language if you exactly reproduce its rounding and preprocessing rules. Regression tests on the Python side lock in the expected canonical bytes; the port must pass them.

### Canonical Frozen Versions

`CANONICAL_FIELDS_V1` and `build_canonical_v1()` in `wesense-ingester-core/wesense_ingester/pipeline.py` are FROZEN. They define the exact set of fields, their order in Python dict iteration (irrelevant due to `sort_keys`), their types, and their default values for absent inputs. The snapshot test in `tests/test_pipeline.py::test_build_canonical_v1_exact_bytes_snapshot` pins the exact output bytes for a specific input so that any future refactor that accidentally changes the serialisation is caught by CI before reaching production.

To change anything about how a canonical reading is built, you create a new version rather than modifying v1. See "Canonical Schema Versioning" further below for the evolution process.

### Signature Flow

```
Ingester:
  1. Build canonical reading (all archivable fields)
  2. Sign: signature = Ed25519(json.dumps(canonical, sort_keys=True))
  3. Publish to MQTT: canonical + signature + ingester_id + key_version
  4. POST to storage broker: canonical + signature + ingester_id + key_version + operational fields

Live Transport (bridge):
  5. Receive from MQTT (includes original signature)
  6. Wrap in SignedReading protobuf using ORIGINAL signature (do not re-sign)
  7. Publish to Zenoh

Remote Station:
  8. Receive from Zenoh, extract SignedReading
  9. Verify original signature against trust list
  10. Write to ClickHouse with original signature, ingester_id, key_version

Archive (both stations):
  11. Query ClickHouse → same fields, same signature
  12. Build Parquet → byte-identical output
  13. Store in iroh → same BLAKE3 hash
```

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

### Adding a New Column

When a new column is needed (e.g., a new metadata dimension that doesn't fit existing fields), changes are required in **six places** to keep ClickHouse, the ingestion pipeline, archives, and the canonical reading consistent. Miss any one and the column either won't appear, won't be signed, or won't archive correctly.

**Checklist for adding a column `new_field`:**

1. **ClickHouse migration** — `wesense/clickhouse/migrations/NNN_add_new_field.sql` with idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Mirror the same file in `wesense-clickhouse-live/migrations/` for manual reference.
2. **ClickHouse schema (fresh installs)** — add the column to `wesense/clickhouse/init/01-create-tables.sql` and `wesense-clickhouse-live/create_sensor_readings.sql`.
3. **Canonical reading** — in `wesense-ingester-core/wesense_ingester/pipeline.py`:
   - Add to `CANONICAL_FIELDS` if it's part of the signed/archived payload
   - Add to `build_canonical()` with explicit type coercion and default
4. **Storage broker model** — in `wesense-storage-broker/src/wesense_gateway/models/reading.py`:
   - Add to `ReadingIn` with its default
   - Add to the `field_validator` list if it's a string field needing None-to-empty coercion
5. **Storage broker pipeline** — in `wesense-storage-broker/src/wesense_gateway`:
   - Add to `CLICKHOUSE_COLUMNS` in `storage/clickhouse.py`
   - Add to the `_build_row` tuple in `pipeline/processor.py`
6. **Parquet archive** (if the column should be in archives) — in `wesense-storage-broker/src/wesense_gateway/archive/builder.py`:
   - Add to `PARQUET_SCHEMA` with appropriate PyArrow type
   - Add to the `SELECT` query in `_get_readings_for_period()`
   - Add to the `columns` list that maps query results to dicts
7. **Live transport** — in `wesense-live-transport/bridge.py`:
   - Add to `BRIDGE_COLUMNS`
   - Add to the row tuple in `_on_inbound_reading`

Once all pieces are in place, `docker compose pull && docker compose restart` on every station applies the change automatically via the migration system.

**Whether to include in the canonical reading:** Only include fields that are part of the reading's identity — things that are intrinsic to what was measured. Operational metadata (`network_source`, `ingestion_node_id`, `received_via`) stays out of the canonical reading because it varies by which station is recording.

**Whether to include in archives:** Most canonical fields go into Parquet. Operational metadata generally doesn't — archives should be portable across stations. The ClickHouse columns `network_source`, `ingestion_node_id`, `received_via` are NOT in the Parquet schema.

### Migrations Applied

| Migration | Columns Added | Purpose |
|---|---|---|
| 001 | `deployment_type_source`, `node_info`, `node_info_url` | Deployment classification metadata |
| 002 | `signature`, `ingester_id`, `key_version` | Ed25519 signing for archive integrity |
| 003 | `received_via` | Track local vs P2P origin |
| 004 | `data_source_name` + default fixes | Human-readable source labels, fix stale defaults |
| 005 | `data_license` | Per-reading license tracking (default CC-BY-4.0) |
| 006 | `reading_type_name` | Human-readable reading type labels (e.g. PM2.5 for pm2_5) |
| 007 | `signing_payload_version` | Which version of the canonical schema was signed (future-proofs signature verification) |

### Archive Schema Versioning

Each Parquet archive's manifest records `parquet_schema_version` (e.g., `"v1"`). Schema-aware consumers check the version before importing. Archives are append-only — old archives with old schemas coexist with new archives indefinitely. Adding a new column doesn't invalidate old archives; they just lack that column, which consumers handle by filling with defaults. **Archives are never rebuilt to backfill a new column** — that doesn't scale to millions of nodes.

### Signing Payload Versioning

Every reading carries `signing_payload_version` recording which canonical schema was used to build the signed bytes. The verifier uses this value to select the correct builder:

- Reading signed with `v1` → verifier calls `build_canonical_v1()` to reconstruct the exact bytes that were signed
- Reading signed with `v2` → verifier calls `build_canonical_v2()`

**The v1 canonical schema is frozen.** `CANONICAL_FIELDS_V1` and `build_canonical_v1()` in `wesense-ingester-core` must never change — they produce byte-identical output forever so that signatures created today remain verifiable in 2225. A CI test enforces this (`tests/test_pipeline.py::test_canonical_fields_v1_is_frozen`).

**Adding canonical fields** (or changing their types/defaults) requires a new version:

1. Define `CANONICAL_FIELDS_V2` and `build_canonical_v2()` in `pipeline.py`
2. Register it in `CANONICAL_BUILDERS`
3. Bump `CURRENT_CANONICAL_VERSION = 2`
4. New readings are signed with v2; old readings continue to verify against v1
5. Both versions coexist in ClickHouse and in Parquet archives — `signing_payload_version` tells anyone looking which one to use

**Archive manifest** also records `current_signing_payload_version` — the version this archiver was writing when the archive was built. Useful context for consumers trying to understand a mixed batch.

## Node Version Compatibility

Stations across the P2P network will inevitably run different software versions. At a million nodes we cannot coordinate upgrades, so the architecture must handle version skew without breaking the archive guarantee.

### The Core Guarantee

**Every station that accepts a given reading produces a byte-identical archive row for it.** Same canonical bytes, same signature, same Parquet row, same BLAKE3 hash. Iroh gossip then deduplicates across the network — the same reading becomes the same blob everywhere, no matter how many stations received it.

This must hold across the two paths a reading can take into any station's archive:

1. **Local ingestion** — station ingests from a sensor, writes to its own ClickHouse, archives.
2. **Live P2P ingestion** — station receives via Zenoh from another station's live transport, writes to its own ClickHouse, archives.

Both paths produce the same Parquet row. This is what makes the "archive sync up" work: if station A goes offline, station B already has the same readings in its ClickHouse (received via live P2P), and B's archive of those readings is identical to A's. When A comes back, iroh gossip detects the BLAKE3 hashes match and dedup is automatic.

### How Version Skew Is Handled: Forward Rejection

Older versions understand newer versions' data — **no.** Older versions don't know what new fields mean or how they affect signing. Guessing is worse than refusing.

Therefore: **a station REJECTS any reading whose `signing_payload_version` is newer than the station's `CURRENT_CANONICAL_VERSION`.** The reading is not written to ClickHouse, not archived, not displayed on the map. A warning is logged so operators know to upgrade.

Conversely, newer versions DO understand older versions' data, because older canonical builders are frozen (`build_canonical_v1()` never changes). A v1.5 station handles v1 readings correctly forever.

### Why This Works

Consider three stations:

- **Station A (v1.5)** — ingests a sensor reading locally, signs it with `signing_payload_version = 2`
- **Station B (v1.3)** — receives it via live P2P
- **Station C (v1.5)** — receives it via live P2P

What happens:

- A writes to its ClickHouse, archives to its iroh blob store
- C is at the same version as A. C writes to its ClickHouse. C archives identically. C's blob has the same BLAKE3 hash as A's blob. Iroh gossip deduplicates.
- B is older. B sees `signing_payload_version = 2 > 1`. **B rejects the reading.** B doesn't write to ClickHouse, doesn't archive, doesn't produce a divergent blob.

When B eventually upgrades to v1.5:
- B starts accepting v2 readings from that moment forward
- B cannot retroactively process the v2 readings it rejected — but it doesn't need to, because A's and C's archives already contain them, and iroh gossip replicates those blobs to B's blob store

The network stays whole. Every reading is archived. Every archive is identical across the stations that accept it. No divergent blobs for the same reading.

### Why Not Just Drop Unknown Fields?

A tempting alternative: B stores the known fields and silently drops the unknown ones. B's archive has fewer columns, different bytes, different BLAKE3 hash. At a million nodes across many versions, this produces a multiplicative explosion of archive copies — the same reading as a different blob for every version that ever touched it. Storage and gossip costs become catastrophic.

Forward rejection sidesteps this entirely: if B can't produce the canonical bytes correctly, B produces nothing.

### Canonical Schema Versioning

Every reading carries `signing_payload_version` recording which canonical schema was used to build the signed bytes. The verifier uses this value to select the correct builder:

- Reading with `signing_payload_version = 1` → verifier calls `build_canonical_v1()` to reconstruct exactly what was signed
- Reading with `signing_payload_version = 2` → verifier calls `build_canonical_v2()`

**The v1 canonical schema is frozen.** `CANONICAL_FIELDS_V1` and `build_canonical_v1()` in `wesense-ingester-core` must never change — they produce byte-identical output forever so that signatures created today remain verifiable in 2225. A CI test enforces this (`tests/test_pipeline.py::test_canonical_fields_v1_is_frozen`).

**Adding canonical fields** (or changing their types/defaults) requires a new version:

1. Define `CANONICAL_FIELDS_V2` and `build_canonical_v2()` in `pipeline.py`
2. Register it in `CANONICAL_BUILDERS`
3. Bump `CURRENT_CANONICAL_VERSION = 2`
4. New readings are signed with v2; old readings continue to verify against v1
5. Both versions coexist in ClickHouse and in Parquet archives — `signing_payload_version` tells anyone looking which one to use
6. Older stations on the network reject v2 readings until upgraded

**Archive manifest** also records `current_signing_payload_version` — the version this archiver was writing when the archive was built. Useful context for consumers trying to understand a mixed batch.

### Archive Schema Versioning

Each Parquet archive's manifest records `parquet_schema_version` (e.g., `"v1"`). Schema-aware consumers check the version before importing. Archives are append-only — old archives with old schemas coexist with new archives indefinitely. Adding a new column doesn't invalidate old archives; they just lack that column, which consumers handle by filling with defaults.

**Archives are never rebuilt to backfill a new column.** At scale this doesn't work. Instead:

- Old archives stay exactly as they were
- New archives (built after the column was added) include the new column
- Consumers querying across both get the new column filled with defaults for old archives, and actual values for new archives

### What This Means in Practice

- **Within a version, all archives are identical.** Stations running the same code produce byte-identical Parquet blobs for the same readings. Iroh gossip dedups perfectly.
- **Across versions, old stations cleanly refuse new data.** No silent divergence. Clear operator signal via logs.
- **Upgrade lag is recoverable.** When a lagging station upgrades, it receives the missed archives via iroh gossip from its peers. No data loss for the network, only a local query-availability gap during the lag.
- **Frozen canonical builders make signatures verifiable forever.** A reading signed in 2026 verifies in 2225 using the v1 builder, which will still exist in the codebase exactly as it does today.

### Protocol-Level Compatibility

- MQTT topics and Zenoh key expressions are stable over time
- The JSON payload is extensible: new fields may be added within a version bump; existing fields are never removed or renamed within a payload version
- OrbitDB documents are schema-free — new fields in node registrations or trust entries are ignored by older code
