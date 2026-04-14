# Governance & Trust

## Trust Model

Every reading in WeSense is signed by the ingester that produced it. The trust list — distributed via OrbitDB — records which ingester keys are trusted. This is the primary defence against bad data injection.

**Trust chain:** Sensor → Ingester (signs with Ed25519) → Storage Broker (stores signature in ClickHouse) → Archiver (includes signature + trust snapshot in Parquet) → Consumer (verifies offline)

## Trust Operations

The `TrustStore` (Python) and OrbitDB trust routes (JavaScript) manage the trust list:

| Operation | API | Effect |
|---|---|---|
| **Add trusted key** | `PUT /trust/:ingester_id` | Adds public key with status `active`. Key version tracks rotations. |
| **Revoke key** | `DELETE /trust/:ingester_id` | Sets all key versions to `revoked` with timestamp and reason. |
| **Query trust** | `GET /trust` | Returns full trust list (all ingester IDs, all versions, all statuses). |
| **Verify reading** | Offline | Consumer checks signature against trust snapshot bundled in archive. |

**Key rotation:** An ingester can rotate its key by adding a new version. The old version remains valid for verifying historical readings. Revocation is separate — it marks all versions as untrusted.

**Revocation and archives:** Revoking an ingester's key doesn't delete archived data. Instead, the revocation status is recorded in OrbitDB and included in future trust snapshots. Consumers can choose whether to include readings from revoked ingesters — the data is still there, but flagged. This is deliberate: even bad data has value for researchers studying data quality.

## Trust Retention — Two Distinct Concerns

Trust data serves two different purposes, and the design treats them separately:

- **Distribution (the "right now" case):** stations need to know which ingesters are currently active so they can verify live P2P readings before accepting them. Keys change, new ingesters come online, bad actors get revoked — this needs a fast, gossip-based, bounded-size mechanism. OrbitDB with a 30-day TTL is the right tool.
- **Retention (the "forever" case):** a researcher in 2225 must be able to verify a signature from 2026. The public key must be available indefinitely. OrbitDB is not the right tool for this — it's ephemeral by design.

These two datasets must not be conflated. Getting this wrong means either unbounded OrbitDB growth or losing the ability to verify old signatures.

### The architecture: public keys travel with the readings

Every reading in ClickHouse carries a `public_key` column alongside `ingester_id`, `key_version`, and `signature`. This means:

- **A reading is self-verifying.** Given a row from ClickHouse, you have the signature AND the public key that signature was made with. No external lookup required.
- **Archives are self-contained.** The Parquet trust snapshot is built deterministically from the readings themselves (`SELECT DISTINCT ingester_id, key_version, public_key FROM ...`). The snapshot is a projection of data already in the archive, not a separate dataset sourced from elsewhere.
- **Disaster recovery is trivial.** Losing `trust_list.json` or OrbitDB doesn't impair archive-building as long as ClickHouse survives. Losing ClickHouse is recoverable from the archives themselves.
- **Storage cost is negligible.** Ed25519 public keys are 32 bytes (44 chars base64). ClickHouse stores them with `LowCardinality(String)` dictionary encoding — one ingester's key appears once in the dictionary and is referenced by every row, costing effectively 1-2 bytes per row after compression.

### The three-layer model

WeSense uses three distinct stores for trust data, each with a clear purpose:

1. **OrbitDB `wesense.trust`** — **distribution only**. 30-day TTL. Used by stations to discover currently-active ingester public keys for live P2P verification. Not used for historical verification or archive building.

2. **ClickHouse `sensor_readings.public_key` column** — **the authoritative historical record**. Every signed reading has its public key stored alongside it. This is the source of truth for archive trust snapshots and for rebuilding archives after recovery.

3. **Archive trust snapshots** (`trust_snapshot.json` inside each Parquet archive) — **permanent, self-contained verification data**. Built from the ClickHouse column via a deduplication query. Content-addressed, immutable, replicated forever via iroh. Future consumers verify signatures using only the archive bundle — no live WeSense infrastructure needed.

The local `TrustStore` (JSON file) remains for one narrow purpose: the live transport verifying inbound P2P readings before writing them to ClickHouse. This set is bounded by the number of currently-active ingesters and can safely follow OrbitDB's TTL.

### How a reading's trust data flows

```
1. Ingester signs reading R with its Ed25519 private key
   - Adds signature, ingester_id, key_version, AND public_key to the reading dict

2. Reading R goes to:
   - Storage broker → ClickHouse (all fields including public_key stored on the row)
   - MQTT → live transport → Zenoh → remote station ClickHouse (same row structure)

3. Archive cycle:
   - Archiver queries ClickHouse for readings from period P
   - SELECT DISTINCT ingester_id, key_version, public_key builds the trust_snapshot
   - Parquet bundle: readings.parquet + trust_snapshot.json + manifest.json

4. Consumer (now or in 2225):
   - Downloads the archive
   - Verifies signatures using the bundled trust_snapshot
   - No OrbitDB, no live WeSense, no external state needed
```

### Consequences

- **OrbitDB can be as ephemeral as we want.** Its 30-day TTL is fine because it's not the authoritative record. Worst case: a station joining the network temporarily can't verify live P2P readings from an ingester that's been silent for >30 days. Historical verification via archives is unaffected.
- **The archiver has no dependency on its own local TrustStore for building archives.** All the trust data it needs comes from the same ClickHouse query that returns the readings.
- **No coordination needed on recovery.** A station restoring from a ClickHouse backup has everything it needs to rebuild archives. No waiting for OrbitDB sync, no trust store bootstrap problem.
- **Revocations are handled separately.** A revoked key is still a valid signature holder for historical readings — the revocation just means consumers should flag those readings. Revocation status is recorded in OrbitDB and in future trust snapshots.

### What this means for operators

- **Back up ClickHouse.** It's the single source of truth for both sensor data and trust history.
- **`data/trust_list.json` is transient.** Losing it is harmless — it rebuilds from OrbitDB within the next sync cycle. It's only used for live P2P verification.
- **A station that joins the network after an ingester has rotated keys** can verify archives from that ingester's old keys using the archive's bundled trust snapshot. It cannot verify the ingester's live readings for key versions that OrbitDB has expired, but it can once the ingester reappears and re-registers. This is acceptable.

## Who Manages Trust

<!-- TODO: Define a formal governance process for trust management. Currently, the project operator manages the trust list directly. As the network grows, this needs to become more distributed. Possible approaches:
  - Automatic trust: any ingester that registers in OrbitDB is trusted by default (open network, revocation-based)
  - Vouching: existing trusted ingesters can vouch for new ones (web of trust)
  - Stake-based: operators who run stations and contribute resources get trust authority
  
  The current approach (project operator manages trust) works for the early network but doesn't scale and contradicts the decentralisation principle. This is one of the harder governance problems to solve. -->

Currently, trust is managed by the project operator. An ingester's Ed25519 key must be added to the trust list before its readings are accepted. This is pragmatic for the early network but will need to evolve as independent operators join.
