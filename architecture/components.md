# Architecture Components

## Wesense Respiro

The primary interface for consuming data. It is a client-side application that unifies historical and live data.

- **Queries ClickHouse Live:** For recent/live sensor readings received via libp2p or local sensors.
- **Queries ClickHouse (historical):** For historical data retrieved from archives via the storage broker.
- **Topic Selector:** UI for choosing which regions/reading types to display.

## The Local Data Stack

The set of services and databases that store sensor data locally and interact with the P2P network. Each participant running their own infrastructure has a Local Data Stack.

**Database:**

- **ClickHouse:** The working database for live/recent data.
  
  - Receives: Local sensor data (via ingester -> storage broker -> ClickHouse) and P2P data (via Zenoh subscription)
  - Ingesters POST readings to the storage broker, which writes to ClickHouse; the Zenoh outbound live transport publishes to the P2P network
  - Queried by: Wesense Respiro for live/recent readings, Queryables for distributed queries
  - TTL: Configurable (e.g., 1 year for raw 5-minute data)
  - Historical data beyond TTL is served from the distributed archive via storage broker (future)

**Services:**

- **Ingesters (Python, wesense-ingester-core):** Thin protocol decoders that receive sensor data via MQTT, decode, geocode, sign (Ed25519), and send readings to the storage broker (`POST /readings`) and publish to Zenoh. Geocoding is the ingester's responsibility — each adapter handles its own position resolution (e.g., Meshtastic caches positions for up to 7 days before telemetry can be geocoded). The storage broker rejects readings without geo data. Each ingester also registers as a Zenoh Queryable for its regions, serving distributed queries. Zenoh integration is native via the Python binding — no sidecar needed.

- **OrbitDB service (Node.js, wesense-orbitdb, port 4002):** Runs Helia/libp2p + OrbitDB as a **private WeSense P2P network** — not connected to the public IPFS network. Manages three synchronized databases (`wesense.nodes`, `wesense.trust`, `wesense.attestations`) for live network state. Exposes HTTP API on port 5200 for Python ingesters and archivers to read/write. Syncs automatically with other OrbitDB instances via GossipSub over libp2p. Runs with `network_mode: host` for mDNS LAN discovery; uses `ORBITDB_BOOTSTRAP_PEERS` for WAN discovery (direct dial to other stations). Does **not** connect to public IPFS bootstrap nodes or the IPFS DHT. Does **not** handle archive storage — that is handled by the storage broker.

- **Storage Broker (`wesense-storage-broker`, port 8080):** Receives readings from ingesters (`POST /readings`), writes to ClickHouse, constructs Parquet archives at subdivision level (`/{country}/{subdivision}/{year}/{month}/{day}/`), and stores them via the archive replicator. Serves archived Parquet files over HTTP (`GET /data/{path}`) for ClickHouse `url()` queries. Handles archive scheduling, gap detection, and replication announcements. See Section 5.7.

- **Archive Replicator (`wesense-archive-replicator`, port 4400):** Rust service providing BLAKE3 content-addressed blob storage with iroh-gossip for P2P archive announcements. The storage broker writes archive files to the archive replicator via HTTP API. Archives stored in the archive replicator are automatically available for P2P replication to other stations. See Section 5.6.

- **Zenoh Query API (Python):** Thin HTTP service that fronts Zenoh Queryables for Respiro. Respiro queries this API for distributed data (choropleth aggregates, device lists, regional summaries) which are resolved via the Zenoh network.

- **Archiver (within Storage Broker, `guardian` persona):** Creates self-contained, independently verifiable archives of signed sensor data. The archiver logic is built into the storage broker as a scheduled task (see Section 5.7).
  
  - Queries ClickHouse for signed readings (with `signature`, `ingester_id`, `key_version` columns)
  - Re-verifies every signature against the trust list
  - Exports to Parquet files preserving signature columns (raw 5-minute data; summarisation deferred)
  - Bundles a trust snapshot (public keys for all referenced ingesters) for offline verification
  - Signs a manifest with the archiver's own Ed25519 key
  - Writes archive files to the archive replicator (BLAKE3 content-addressed blobs)
  - Archive replicator announces the new archive via gossip for real-time P2P discovery
  - Content-addressing (BLAKE3) ensures immutability — the hash is the identity. If a second archiver independently processes the same data and produces the same hash, the data is verified by definition. No separate consensus protocol is needed.

For P2P network layer details, see [P2P Network](./p2p-network).

## The Bootstrap Gateway

A simple, community-run web server that acts as a bridge for resource-constrained devices.

- **Function:** Caches discovery information from OrbitDB and exposes it via HTTP.
- **Purpose:** Allows simple sensors to find Public Ingestion Nodes without running a P2P client.

**Gateway Response Example:**

```json
{
  "ingesters": [
    {
      "endpoint": "mqtt://nz1.wesense.io:1883",
      "region": "nz",
      "sensor_count": 1250
    },
    {
      "endpoint": "mqtt://nz2.wesense.io:1883",
      "region": "nz",
      "sensor_count": 890
    }
  ]
}
```

## The MQTT Hub (EMQX)

**Status:** Deployed and running. EMQX 5.8.9 with authentication (salted SHA-256), Meshtastic forwarding bridges, and dashboard lockdown.

The MQTT Hub is the unified entry point for sensor data into the WeSense network.

- **Broker:** EMQX 5.8.9 with config-file authentication (opt-in via `init-auth.sh`), dashboard bound to localhost/VPN only
- **Deployment:** Docker container in the `wesense` deployment repo, `hub` profile for standalone broker, included in `station` profile for full stack
- **Meshtastic Forwarding:** EMQX rule engine bridges forward all `msh/#` traffic to mqtt.meshtastic.org and Liam Cottle's MQTT server. Configured in `emqx.conf` with `rule_engine` + `bridges` blocks.

**Functions:**

1. **MQTT Broker** - Sensors connect via `mqtt.wesense.earth:1883` (or local broker)
2. **Authentication** - Salted SHA-256 password hashing, per-device credentials via bootstrap CSV
3. **Routing** - Forwards raw data to appropriate ingester(s) via topic subscriptions
4. **Meshtastic Multiplexing** - Bridges forward packets to external Meshtastic services automatically

**Note:** There is no rate normalization at ingestion time. Data is stored raw and aggregation happens at query or archive time (see Section 5.1).

**Architecture:**

```
+-------------------+     +-------------------+
| WeSense Sensor    |     | Meshtastic        |
| (ESP32)           |     | Device            |
+---------+---------+     +---------+---------+
          |                         |
          v                         v
+--------------------------------------------+
|              EMQX Broker                    |
|  (mqtt.wesense.earth / local)               |
|                                             |
|  Bridges: msh/# -> meshtastic.org          |
|           msh/# -> liamcottle.net           |
+---------+-------------------+---------------+
          |                   |
          v                   v
+-------------------+  +----------------------+
| wesense-ingester  |  | wesense-ingester-    |
| -wesense          |  | meshtastic           |
+-------------------+  +----------------------+
```
