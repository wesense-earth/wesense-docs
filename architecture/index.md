# Architecture Overview

The **Decentralised Data Commons** is WeSense's architecture for creating a **globally replicatable, community-owned, permanent environmental dataset** that requires no central servers or controlling authorities.

This document outlines a "local-first," fully P2P architecture where individual contributors, network infrastructure, and data consumers can all participate in a resilient, open ecosystem.

## Architectural Principles

1. **Data is the Database**: The canonical dataset is the collection of immutable, content-addressed files in the distributed archive, not a specific running database.
2. **Local-First Querying**: All querying is performed on a user's local copy of the data. The network is for discovering and retrieving data, not for running queries.
3. **Decentralized Ingestion**: Anyone can contribute data without permission by running their own infrastructure or using community-provided public nodes. There is no central point of data collection.
4. **Decentralized Discovery**: A distributed "address book" (OrbitDB) allows participants to find data, services, and other nodes without a central registry.
5. **Tiered Participation**: The network is accessible to everyone, from simple sensor operators to users running sophisticated data-serving infrastructure.
6. **Selective Subscription**: At scale, consumers subscribe only to the data they need via partitioned topics, not a global firehose.
7. **Storage Abstraction**: The archive layer is accessed through a storage broker (`wesense-storage-broker`) backed by the archive replicator (`wesense-archive-replicator`) for content-addressed blob storage. The storage broker provides a uniform HTTP API for both ingesters (write) and consumers (read).
8. **Transport Security**: All service-to-service connections support TLS encryption as an opt-in configuration. P2P layers (libp2p, iroh-gossip) are encrypted by default. HTTP and MQTT connections use a deployment-local CA with per-service certificates, activated via environment variables.

## Decentralization Principles

**Core principle: No paid infrastructure guarded by a single entity.**

WeSense must remain truly open - not "open but hosted by us" like many other projects. This means:

**Required properties:**

- Any participant can replicate the entire system independently
- No single organization controls access to the data
- No domain names, API keys, or accounts required to participate
- The network continues functioning if any single entity disappears

**This rules out:**

- Centralized API endpoints (e.g., `api.wesense.io/readings`)
- Single-provider hosted databases (AWS RDS, managed ClickHouse, etc.)
- Paid IPFS pinning services as the only copy of data
- Authentication systems controlled by one organization
- DNS dependencies for core functionality

**This allows:**

- Eclipse Zenoh (peer-to-peer pub/sub + queryables, anyone can run a node or router)
- Content-addressed storage (Iroh) via storage broker
- OrbitDB (replicated database across all participants)
- Bootstrap/convenience nodes (helpful but not required - replaceable by any participant)
- Optional hosted services for convenience (as long as alternatives exist)

**Practical implication:** A researcher in 2225 should be able to access WeSense data without needing permission from, or payment to, any organization that exists today.

## Two Data Paths: Live and Historical

WeSense separates real-time and historical data into distinct paths, each optimized for its purpose:

```
┌─────────────────────────────────────────────────────────────────┐
│                      LIVE DATA PATH                              │
│                                                                  │
│  Ingester → Eclipse Zenoh (pub/sub + queryables) → Consumer     │
│                                                                  │
│  • Real-time (seconds latency)                                  │
│  • Ephemeral (not stored on the P2P network itself)             │
│  • Subscribe to geographic regions via wildcard key expressions  │
│  • Queryables for catchup, choropleth aggregates, device lists  │
│  • Ed25519 signed messages for data authenticity                │
│  • No central server - peers connect directly or via routers    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    HISTORICAL DATA PATH                          │
│                                                                  │
│  Ingester → Storage Broker → ClickHouse (with signatures)        │
│                                    ↓                              │
│                         Parquet + trust snapshot                  │
│                         + signed manifest                        │
│                                    ↓                              │
│                    Storage Broker → Archive Replicator            │
│                                               ↓                  │
│                    Consumer fetches self-verifiable archives      │
│                                                                  │
│  • Storage broker + archive replicator — serves Parquet over HTTP│
│  • Signatures persisted in ClickHouse alongside every reading   │
│  • Each archive is self-contained (Parquet + trust + manifest)  │
│  • Independently verifiable offline — no live infra required    │
│  • Content-addressed (BLAKE3) — immutable once archived          │
│  • Raw 5-minute archives (summarisation deferred — community    │
│    decision, see Section 5.4)                                    │
│  • Pull only the regions/dates you need                         │
└─────────────────────────────────────────────────────────────────┘
```

**Consumer use cases:**

| Use Case              | Live Path                             | Historical Path                     | Example                                   |
| --------------------- | ------------------------------------- | ----------------------------------- | ----------------------------------------- |
| Real-time map         | Subscribe to Zenoh topics             | Not needed                          | Dashboard showing current sensor readings |
| Global choropleth     | Query Zenoh Queryables                | Not needed                          | Country-level averages at zoom-out        |
| Research query        | Not needed                            | Fetch archives via storage broker   | "CO2 trends over the last decade"         |
| Full map with history | Subscribe for live updates            | Backfill from storage broker        | Map with historical graphs per sensor     |
| Late-joiner catchup   | Query Queryables for recent history   | For short gaps                      | Consumer reconnects after 2-hour outage   |

**Why separate paths?**

- **Live data** needs low latency and continuous streaming — Zenoh pub/sub + queryables excels here
- **Historical data** needs permanence and efficient bulk retrieval — content-addressed storage excels here
- Combining them in one system would compromise both (too slow for live, too complex for archives)
- Consumers merge the two paths in their local ClickHouse database

## Discovery via OrbitDB

OrbitDB serves as the decentralized "address book" and synchronized state database for the network. It runs on Helia/libp2p on port 4002, forming a **private WeSense P2P network** completely separate from both Zenoh and the public IPFS network.

> **IMPORTANT — Two separate P2P systems, do not confuse them:**
> 
> | System                     | Port | Network                                                      | Purpose                                                                  |
> | -------------------------- | ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
> | **OrbitDB + Helia/libp2p** | 4002 | **Private WeSense network** — only WeSense stations connect  | Synchronized state: node registry, trust list, store scopes              |
> | **Storage Broker**         | 8080 | **Archive API** — receives readings, serves Parquet archives | Reading ingestion, archive scheduling, HTTP serving for ClickHouse url() |
> | **Archive Replicator**     | 4400 | **Content-addressed blob storage** — BLAKE3 hashing, gossip  | Archive blob storage, P2P replication announcements                      |
> 
> Helia uses libp2p for transport but does **not** connect to any public DHT, bootstrap nodes, or non-WeSense peers. It is a closed network where every peer is another WeSense station. The storage broker handles all archive storage and distribution.

**What OrbitDB manages:**

OrbitDB is for **small, slowly-changing network state** — data bounded by the number of stations/ingesters, not by data volume. It replicates the entire database to every peer, so databases must stay small.

1. **Node Registry** (`wesense.nodes`): All active infrastructure nodes with their endpoints, regions, and capabilities. Written by the archive replicator's discovery loop (60-second heartbeat). One entry per station — bounded by station count, not data volume.
2. **Trust List** (`wesense.trust`): Ed25519 public keys for verified ingesters, used for message signature verification. One entry per ingester signing key. Small by design.
3. **Store Scope** (`wesense.stores`): What geographic regions each archive replicator stores and serves. Used by Respiro's replication health panel to show per-region copy counts. One entry per station.

**Note:** Archive storage and discovery does not use OrbitDB or Helia. The storage broker (`wesense-storage-broker`) backed by the archive replicator (`wesense-archive-replicator`) handles archive storage and serves Parquet files over HTTP. The archive directory tree is the index — organized by country/subdivision/year/month/day, browsable via the storage broker's HTTP endpoint. Consumers fetch Parquet files via the storage broker and import them into local ClickHouse for querying. No separate metadata database needed.

> **RESOLVED (2026-04-01): Attestations migrated out of OrbitDB**
> 
> Archive attestations (`wesense.attestations`) were removed from OrbitDB. They had grown to 4,888+ entries and were causing sync timeouts, connection cycling, and memory leaks. Archive discovery now uses the archive replicator's gossip announcements and periodic index-as-a-blob catch-up — no OrbitDB involvement. The three remaining databases (nodes, trust, stores) are small and bounded by station count.

**Reliability & Maintenance:**

OrbitDB's append-only oplog design means entries are never removed. Combined with Helia v6's streaming blockstore incompatibility (see `wesense-orbitdb/src/helia-compat.js`), this created orphaned oplog entries — entries referencing identity blocks that no longer exist on any peer — which replicated between all peers indefinitely, causing `LoadBlockFailedError` spam.

The following mitigations are in place (implemented 2026-04-12):

1. **Oplog entry TTL** — all databases are opened with a 30-day TTL via our OrbitDB fork (`wesense-earth/orbitdb#feat/ttl`). Entries older than 30 days are filtered from reads and not sent during sync. New entries include a wall-clock timestamp in the signed data. Old entries without timestamps are never filtered (backwards compatible). A `compact()` method is available for explicit storage reclamation (run daily via the compaction scheduler in `index.js`).

2. **Permanent block blacklist** — after 3 failed fetch attempts (45 minutes), unreachable block CIDs are permanently blacklisted and persisted to `data/orbitdb/block-blacklist.json`. Blacklisted blocks are silently rejected on subsequent requests. The blacklist survives restarts.

3. **Write-ahead verification** — the `blockstore.put()` wrapper reads back every block after writing and verifies the SHA-256 hash matches the CID. Catches partial writes from disk-full or I/O errors before they create orphaned references.

4. **Disk space monitoring** — checks filesystem usage via `fs.statfs` every 5 minutes. At 95%, blocks all blockstore writes. At 90%, logs warnings. Writes also blocked reactively if any `put()` fails with a disk-full error. Resumes when space drops below 90%.

5. **Helia v6 compatibility wrapper** (`helia-compat.js`) — adapts Helia's streaming `blockstore.get()` (AsyncGenerator) to the non-streaming API (Promise<Uint8Array>) that OrbitDB expects. Also wraps IPFSBlockStorage to handle both APIs transparently.

> **Upstream PR:** [orbitdb/orbitdb#1251](https://github.com/orbitdb/orbitdb/issues/1251) — filed for oplog entry expiry/TTL support. The TTL implementation is in our fork at `wesense-earth/orbitdb#feat/ttl`.

**How OrbitDB works:**

- Built on Helia/libp2p and CRDTs (Conflict-free Replicated Data Types)
- Every participant replicates the database locally
- Updates propagate via GossipSub (libp2p pubsub) — only changes, not the full database
- Queries run against local replica (fast, offline-capable)
- Automatic conflict resolution via CRDTs (mathematically proven eventual consistency)

**How stations discover each other:**

OrbitDB replication requires a direct libp2p connection between peers. GossipSub relays database updates between connected peers, but doesn't help peers find each other in the first place. WeSense uses two complementary discovery mechanisms:

1. **LAN — mDNS**: The OrbitDB container runs with `network_mode: host` so libp2p's mDNS multicast operates on the real network interface (Docker bridge networking isolates multicast). Stations on the same LAN discover each other within seconds, zero configuration.

2. **WAN — Configured peers**: Stations list other WeSense stations via the `ORBITDB_BOOTSTRAP_PEERS` environment variable (IP, hostname, or full multiaddr). The service periodically dials these addresses and reconnects after failures. This is how stations on different networks (e.g. a home LAN station and a VPS) find each other. No public IPFS infrastructure is involved — connections are direct between WeSense stations.

**Database address determinism:** OrbitDB database addresses are derived from the database name + type + access controller. By using `IPFSAccessController` with open writes (`write: ["*"]`), the address depends only on the name and type — not the creator's identity. This means every station opening `wesense.nodes` gets the same database address, enabling automatic replication.

**OrbitDB databases in WeSense:**

| Database         | Purpose                                       | Scale                  | Example Entry                                                                                                             |
| ---------------- | --------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `wesense.nodes`  | Registry of all infrastructure nodes          | 1 per station (small)  | `{_id: "archive-replicator-a1b2", iroh_node_id: "...", iroh_address: "203.0.113.50", archive_replicator_port: 4400, ...}` |
| `wesense.trust`  | Ingester Ed25519 public keys and revocations  | 1 per ingester (small) | `{_id: "wsi_a1b2c3d4", public_key: "MCow...", key_version: 1, status: "active"}`                                          |
| `wesense.stores` | Archive replicator guardian scope per station | 1 per station (small)  | `{_id: "archive-replicator-a1b2", guardian_scope: ["nz/*"], blob_count: 847, type: "archive-replicator"}`                 |

**Consumer workflow (historical data):**

```
1. Discover a station's storage broker endpoint (from wesense.nodes, website, or hardcoded)
2. Browse the archive directory tree via the storage broker HTTP API (by country/subdivision/year/month/day)
3. Fetch Parquet files for the regions/dates of interest via the storage broker HTTP endpoint
4. Import into local ClickHouse (via url() function) or query directly with DuckDB/pandas
5. Verify signatures using the bundled trust_snapshot.json (offline, no network needed)
```

**Consumer workflow (live data):**

```
1. Subscribe to Zenoh key expression: wesense/v2/live/nz/**
2. Receive SignedReading messages as they're published
3. Verify Ed25519 signature against trust list (from OrbitDB)
4. Deserialize protobuf payload
5. Insert into local ClickHouse
```

**Network resilience role:** OrbitDB on Helia/libp2p provides an independent discovery path from Zenoh. If Zenoh routers are unavailable, nodes can still connect to the OrbitDB network (via mDNS or configured peers), replicate the registry, find other station addresses, and re-establish Zenoh connections. See P2P_Preparation.md section 4.2 for the full four-layer resilience model.

---

## Summary

The WeSense Decentralised Data Commons handles massive scale (1M+ devices) through:

1. **Geographic Partitioning**: Consumers subscribe only to regions they need via Zenoh wildcard key expressions
2. **Raw Data Ingestion**: Data stored as received; aggregation happens at query/archive time
3. **ClickHouse Compression**: 15-30x compression allows long-term retention of raw data
4. **Data Authenticity**: Ed25519 ingester message signing with trust list distributed via OrbitDB. Signatures persisted in ClickHouse alongside every reading for end-to-end archive integrity.
5. **Verifiable Archives**: Self-contained archives (Parquet + trust snapshot + signed manifest) that anyone can verify offline. Content-addressing (BLAKE3) provides immutability. Ed25519 signatures on every reading provide traceability back to the ingester that produced it.
6. **Separation of Concerns**:
   - MQTT (EMQX) for sensor→ingester (unchanged from current architecture)
   - Eclipse Zenoh for ingester→consumer (live P2P with wildcards, queryables, and dual-mode NAT)
   - OrbitDB on Helia (port 4002) for synchronized state (node registry, trust list, attestations)
   - Storage broker (port 8080) + archive replicator (port 4400) for historical archives (BLAKE3 content-addressing, gossip replication)
7. **Storage Abstraction**: Archive layer accessed through a storage broker backed by the archive replicator. Ingesters become thin protocol decoders, sending standardised readings to the storage broker API.
8. **Transport Security**: All service-to-service connections support opt-in TLS via a deployment-local CA. P2P layers (libp2p, iroh-gossip) are encrypted by default. Ed25519 signatures provide data-level authenticity independent of transport encryption.
9. **Four-Layer Network Resilience**: Official routers → mesh-mode peers → OrbitDB/libp2p discovery → LAN multicast. The network becomes self-sustaining as it grows.

No single entity owns or controls the data. Anyone can run an ingester, anyone can consume what they need. A researcher in 2225 can access WeSense data without permission from, or payment to, any organization that exists today — and can independently verify every reading in the archive using only the bundled trust snapshot.

**Iroh replication plan:** See `IrohPlan.md` for the active implementation plan (P2P archive replication, DERP relays, store scopes, Respiro health UI).
**Historical decision rationale:** See `archived/P2P_Preparation.md` for the original evaluation of alternatives and documented decisions.
**Historical implementation plan:** See `archived/P2P_Implementation_Plan.md` for the original six-phase build plan (Phases 1-4 complete, 5-6 absorbed into IrohPlan).
