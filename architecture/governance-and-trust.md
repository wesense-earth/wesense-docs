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

## Who Manages Trust

<!-- TODO: Define a formal governance process for trust management. Currently, the project operator manages the trust list directly. As the network grows, this needs to become more distributed. Possible approaches:
  - Automatic trust: any ingester that registers in OrbitDB is trusted by default (open network, revocation-based)
  - Vouching: existing trusted ingesters can vouch for new ones (web of trust)
  - Stake-based: operators who run stations and contribute resources get trust authority
  
  The current approach (project operator manages trust) works for the early network but doesn't scale and contradicts the decentralisation principle. This is one of the harder governance problems to solve. -->

Currently, trust is managed by the project operator. An ingester's Ed25519 key must be added to the trust list before its readings are accepted. This is pragmatic for the early network but will need to evolve as independent operators join.
