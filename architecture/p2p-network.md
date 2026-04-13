# P2P Network

Two independent P2P networks, each serving a distinct purpose:

- **Eclipse Zenoh (Live data transport):** Real-time pub/sub with native wildcard key expressions and distributed Queryables. Ingesters publish SignedReading protobuf messages to geographic key expressions (e.g., `wesense/v2/live/nz/auk/*`). Consumers subscribe to regions of interest. Queryables enable distributed queries for choropleth data, device lists, and late-joiner catchup. Operates via community-run `zenohd` routers and direct peer connections.

- **OrbitDB on Helia/libp2p (Synchronized state, port 4002):** CRDT-based database for node registry, trust list, and store scopes. Every participant holds a full local replica, synced via GossipSub delta propagation. This is a **private WeSense P2P network** — it does not connect to the public IPFS DHT or bootstrap nodes. Every peer on this network is another WeSense station. Peer discovery: LAN via mDNS (`network_mode: host`), WAN via `ORBITDB_BOOTSTRAP_PEERS` (direct dial to known stations). Provides an independent network entry path from Zenoh — if Zenoh routers are unavailable, stations can still reach each other via the OrbitDB libp2p network, replicate the registry, and find peer addresses. OrbitDB only manages small, station-bounded state — it does not handle archive storage or attestations.

- **Storage Broker + Archive Replicator (Historical archives, ports 8080 + 4400):** The storage broker (`wesense-storage-broker`) receives readings, writes to ClickHouse, and serves Parquet archives over HTTP. The archive replicator (`wesense-archive-replicator`) provides BLAKE3 content-addressed blob storage with gossip-based P2P replication announcements. Each archive bundles signed readings (Parquet with signature columns), a trust snapshot (public keys), and a signed manifest (content hash + archiver identity). Archives are content-addressed (BLAKE3) — identical data always produces the same hash, providing immutability and implicit verification when multiple archivers independently produce the same result. Parquet files are self-describing and can be queried directly by ClickHouse (via `url()`), DuckDB, Pandas, Spark, etc. Researchers can verify every reading offline using only the bundled trust snapshot. See Sections 5.6 and 5.7.
  
  > **Why is OrbitDB separate from the storage broker?** They serve fundamentally different purposes. Helia/libp2p on port 4002 forms a **private WeSense network** for OrbitDB state synchronization — only WeSense stations connect, no public infrastructure involved. The storage broker on port 8080 + archive replicator on port 4400 handle archive storage and HTTP serving. OrbitDB does not store archive content. The storage broker does not manage trust or node registry. They are independent systems.

## Distribution Layer

**Status:** Implemented. Iroh selected as the archive distribution backend.

The distribution layer handles how archive partitions are replicated across the network and how ClickHouse instances retrieve historical data. After evaluating IPFS (Kubo) and Iroh, **Iroh was selected** as the archive backend for its better architectural fit with WeSense's closed-community replication model.

**Why Iroh over IPFS:**

| Criterion                       | IPFS (Kubo)                         | Iroh (selected)                                               |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| **Content addressing**          | SHA-256 CIDs                        | BLAKE3 (faster, SIMD-accelerated)                             |
| **Efficient bulk download**     | Single gateway (not true P2P)       | True P2P with verified streaming + resume at 1KiB granularity |
| **Works behind NAT**            | Unreliable (AutoNAT/relay v2)       | Excellent (Tailscale-derived hole punching + DERP relay)      |
| **Scales without centralising** | Gateways tend toward centralisation | Gossip + direct transfer, no gateway bottleneck               |
| **Resource usage**              | Heavy (Kubo DHT maintenance)        | Light (200K concurrent connections demonstrated)              |
| **Blob model**                  | UnixFS chunking overhead            | Flat blob model ideal for opaque Parquet files                |

The `wesense-archive-replicator` (Rust, port 4400) provides BLAKE3 content-addressed blob storage with iroh-gossip for P2P archive announcements. The storage broker communicates with it via HTTP API. Archives written to the archive replicator are automatically available for P2P replication to other stations running the same service.

### Archive Replicator Connectivity Model

Archive replicators form a **closed P2P network** — they do not connect to iroh's public relay infrastructure or any external discovery service. This is a deliberate architectural choice for a system designed to scale to 100 million+ nodes without depending on third-party infrastructure.

**Peer discovery:** Each archive replicator registers its iroh NodeId, QUIC address, and port in OrbitDB (`wesense.nodes`). Periodically (every 60s), archive replicators query OrbitDB for other registered replicators and wire discovered peers into the iroh endpoint's address lookup and gossip mesh. This is fully automatic — no manual bootstrap peers required.

**Direct QUIC connections:** Archive replicators connect directly to each other via QUIC on port 4401 (UDP). Operators must:

1. Set `ANNOUNCE_ADDRESS` to their host's reachable IP or hostname (public IP, VPN IP, etc.)
2. Port-forward UDP 4401 on their router/firewall

This is the same model as running any P2P service — the operator ensures their node is reachable. The archive replicator logs a clear warning at startup if `ANNOUNCE_ADDRESS` is not set.

**No public relays:** The archive replicator uses `RelayMode::Disabled` and `clear_address_lookup()` by default. It does not connect to iroh's public DERP relays or DNS-based discovery. At 100M nodes, public relays would be overwhelmed and introduce a centralisation point.

**NAT traversal:** Most home/office NATs support port forwarding, which is sufficient. For the minority of users behind CGNAT (carrier-grade NAT) where port forwarding is impossible, WeSense will deploy its own DERP relay servers in the future:

| NAT Type           | Solution                       | Status             |
| ------------------ | ------------------------------ | ------------------ |
| Standard NAT       | Port-forward UDP 4401          | Working now        |
| CGNAT / Double-NAT | WeSense DERP relay servers     | Future (see below) |
| VPN / Tailscale    | Set ANNOUNCE_ADDRESS to VPN IP | Working now        |

**Future: WeSense relay servers.** When needed for CGNAT users, WeSense community members will deploy DERP relay servers (using iroh's `iroh-relay` binary). These relays will be:

- Operated by community members on the `hub` persona (just like Zenoh routers)
- Registered in OrbitDB (`wesense.nodes` with `iroh_relay_urls` field) so all archive replicators discover them automatically
- Configured on relay-operating nodes via `IROH_RELAY_URLS` env var
- Propagated to other archive replicators during OrbitDB peer discovery — configure once, all peers learn

The relay infrastructure is opt-in and community-operated. No single entity controls relays. If a relay goes down, peers fall back to direct connections or other relays. The archive replicator code already supports `IROH_RELAY_URLS` and relay discovery from peers — only the relay servers themselves need to be deployed.

**Store scope:** Each archive replicator is configured with `IROH_STORE_SCOPE` (default `*/*` — replicate everything). This controls which regions' archives are downloaded and stored locally. Everything stored is automatically served to any peer that requests it. Operators can narrow scope to save disk space (e.g. `nz/*` for only New Zealand).

### Archive Replication Protocol

Archive replication uses two mechanisms that work together over the existing iroh QUIC connections — no HTTP ports, no additional infrastructure, no centralised coordination.

**Mechanism 1: Real-time gossip announcements (normal operation)**

When the storage broker archives a new batch of readings:

1. Storage broker builds a deterministic Parquet file for a country/subdivision/day

2. Storage broker PUTs the blob to the local archive replicator via HTTP (internal Docker network only)

3. Archive replicator stores the blob with BLAKE3 content-addressing

4. Archive replicator broadcasts a gossip announcement on the `wesense-archives` topic:
   
   ```
   { msg_type: "archive_available",
     country: "nz", subdivision: "wgn", date: "2026-03-31",
     hash: "<BLAKE3 hex>", path: "nz/wgn/2026/03/31/readings.parquet",
     size: 245000, node_id: "<announcing node>" }
   ```

5. All connected peers receive the announcement via iroh-gossip (QUIC)

6. Each peer checks:
   
   - Does the path match my store scope? (e.g. `IROH_STORE_SCOPE=nz/*`)
   - Do I already have this blob in my path-index?

7. If in scope and missing: download the blob from the announcing peer via iroh-blobs Downloader (QUIC, verified streaming, resumable)

8. Update local path-index

This handles the steady-state case — all online peers get new archives within seconds of creation. The gossip message is ~200 bytes. The actual blob transfer uses iroh's efficient QUIC streaming protocol.

**Mechanism 2: Peer catch-up on connect (index-based bulk sync)**

iroh-gossip is fire-and-forget — if a node is offline when an announcement is broadcast, it never receives it. New nodes joining the network have never received any announcements. This is the catch-up problem.

> **IMPORTANT: Do NOT re-announce individual archives over gossip for catch-up.**
> 
> The original design tried broadcasting one gossip message per archive on `NeighborUp`. With 80K+ archives, this floods the gossip receiver buffer (`Event::Lagged`), overwhelms the fetch channel, and drops most messages. Gossip is for single real-time announcements, not bulk sync. See implementation notes below.

**The correct approach: index-as-a-blob**

The path-index (`path_index.json`) is itself a blob — a JSON file mapping logical paths to BLAKE3 hashes. Instead of announcing 80K individual items, exchange the index as a single blob and diff locally.

Flow:

1. New node joins the gossip topic (discovered via OrbitDB, connected via QUIC)
2. On `NeighborUp`, the new node sends a single gossip message: `{ type: "catchup_request", node_id: "..." }`
3. The existing peer receives the request and writes its `path_index.json` to the blob store as a temporary blob (or it's already there)
4. The existing peer responds with a single gossip message: `{ type: "catchup_index", node_id: "...", hash: "<BLAKE3 of path_index.json>", size: 5000000 }`
5. The new node downloads the index blob via iroh-blobs Downloader (single QUIC transfer, ~5MB for 80K entries, verified streaming, resumable)
6. The new node parses the peer's index, diffs against its own local index
7. For each missing archive (matching store scope): download the blob via Downloader from the peer

This uses iroh the way it was designed:

- **One metadata transfer** (the index blob) instead of 80K gossip messages
- **iroh Downloader handles throughput, backpressure, multiplexing natively** — no application-level rate limiting or channel management
- **The diff is local** — no network traffic for archives already held
- **Downloads are parallel** — the Downloader can fetch multiple blobs concurrently

**Status:** Implemented (2026-04-01). Index-as-a-blob exchange with `send().await` backpressure. Catch-up runs on `NeighborUp` AND every 15 minutes periodically. Single-threaded replicator currently processes ~12,800 archives/hour (~307K/day).

> **RESOLVED (2026-04-12): Iroh blob store garbage collection**
> 
> The index-as-a-blob catch-up mechanism was creating a new ~12 MB blob (the serialised path index) on every sync exchange. With `named_tag`, the tag reassigns to the new blob each time, but without garbage collection enabled on the FsStore, old untagged blobs accumulated indefinitely. Over months of operation, this resulted in ~26,000 orphaned index copies consuming 41+ GB per node — while actual archive data was only ~1 GB.
> 
> **Fix:** Enabled iroh's built-in garbage collection via `FsStore::load_with_opts` with `GcConfig { interval: 600s }`. GC runs every 10 minutes, identifies blobs not referenced by any tag (mark phase), and deletes them in batches (sweep phase). After deployment, storage dropped from 43 GB to 324 MB — a 99% reduction.
> 
> **Storage profile (with GC, 98K archives, scope `*/*`):**
> 
> - Actual Parquet archive data: ~1 GB (ZSTD-compressed internally)
> - Iroh metadata + active sync blobs: ~300 MB
> - ClickHouse sensor readings: ~370 MB (columnar compression)
> - ClickHouse system logs (with 3-day TTL): ~20 MB
> 
> The iroh FsStore uses a SQLite database (`blobs.db`) internally for blob metadata indexing. This is an implementation detail — operators don't interact with it directly.

**Why this scales to 10M+ nodes:**

Real-time announcements (mechanism 1):

- iroh-gossip uses epidemic broadcast with ~6-8 direct peers per node. One announcement reaches 10M nodes in ~23 hops (log_8 of 10M). Each node only processes messages from its direct peers, not all 10M.
- At 10M nodes producing 10 archives/day each = 100M announcements/day globally = ~1,200/second. Each node receives these filtered by its gossip mesh peers, not all 1,200/sec. With store scope filtering, a node storing `nz/*` only processes NZ-related announcements.
- Gossip messages are ~200 bytes. Even at 1,200/sec that's 240KB/sec — trivial bandwidth.

Catch-up (mechanism 2 — index-based):

- New node downloads one 5MB index blob per peer, not 80K individual messages
- Diff is local computation — O(N) where N is the peer's index size, no network traffic
- Missing blob downloads use iroh's native concurrent downloader — QUIC multiplexing handles throughput
- A node with `nz/*` scope only downloads NZ archives from the diff — ~1% of a global peer's index
- Multiple peers can serve the same blob — the Downloader automatically finds the fastest source

At 10M nodes with 1M archives each:

- Index blob: ~60MB per peer (1M entries x ~60 bytes each). Downloaded once per peer connect. Compressible.
- Diff produces a list of missing blobs. Download only what's needed.
- iroh handles the rest — verified streaming, resume on disconnect, parallel transfers.

**Failure modes and recovery:**

| Scenario                           | What happens                             | Recovery                                                                              |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Node offline during announcement   | Misses the gossip message                | Catches up via index exchange on reconnect                                            |
| Node joins network for first time  | Has no archives                          | Downloads peer index, diffs to empty local index, downloads everything matching scope |
| Peer disconnects mid-download      | Downloader transfer interrupted          | iroh resumes at 1KiB granularity on reconnect                                         |
| Gossip message lost (network blip) | Node doesn't know about one archive      | Catches up on next peer reconnect via index diff                                      |
| Two archivers create same archive  | Same BLAKE3 hash (deterministic Parquet) | Second copy is a no-op — already in local store                                       |

**Future: Increasing catch-up throughput**

The current replicator downloads one blob at a time (~20ms each = ~50 blobs/sec). At scale:

| Archives to sync | Current (sequential) | With 10 parallel | With 50 parallel |
| ---------------- | -------------------- | ---------------- | ---------------- |
| 10,000           | 3 minutes            | 20 seconds       | 4 seconds        |
| 100,000          | 33 minutes           | 3 minutes        | 40 seconds       |
| 1,000,000        | 5.5 hours            | 33 minutes       | 7 minutes        |
| 10,000,000       | 2.3 days             | 5.5 hours        | 1.1 hours        |

Improvements in priority order:

1. **Parallel blob downloads** — The iroh Downloader supports concurrent transfers natively. Spawn N download workers reading from the same channel. Each worker downloads independently via QUIC multiplexing (multiple streams on one connection). The `send().await` backpressure still works — it just feeds N workers instead of 1. Expected: 10-50x throughput increase with minimal code change.

2. **Multi-peer downloads** — When multiple peers hold the same blob (common for popular regions), the Downloader can fetch from the closest/fastest peer. The `source_node` in FetchRequest currently names one peer. Extending to multiple providers lets iroh's built-in provider selection optimise throughput.

3. **Compressed index transfer** — At 10M+ entries, the path-index blob grows to ~60-100MB. Compressing with zstd before import (and decompressing on receive) reduces transfer to ~10-20MB. The diff computation stays the same.

4. **Incremental index diff** — Instead of exchanging the full index every cycle, exchange only changes since the last sync. Track a "last sync timestamp" per peer. The catch-up request includes the timestamp, and the peer only exports entries newer than that. Reduces index blob size from O(total archives) to O(new archives since last sync).

5. **Scope-filtered index export** — When responding to a catch-up request, filter the index to only include entries matching the requester's store scope. A node storing `nz/*` doesn't need to download a 100MB global index — just the NZ subset. Requires the requester to include its scope in the `catchup_request` message.

6. **Range-based blob batching** — Instead of downloading each archive file individually (readings.parquet, manifest.json, trust_snapshot.json = 3 downloads per archive day), batch all files for a date range into a single transfer. iroh supports collections (groups of blobs transferred as one unit).

None of these require architectural changes — the index-as-a-blob + backpressure design supports all of them as incremental improvements.

**What this replaces:**

1. OrbitDB attestations (removed — grew unbounded, caused sync timeouts and OOM)
2. HTTP reconciliation (removed — required exposed port, polled every 15 minutes)
3. Gossip re-announce flood (removed — overwhelmed gossip buffer at scale)

## NAT Traversal for Direct Station-to-Station Connections

**Priority:** Medium — the current relay-through-bootstrap approach works and scales to dozens of stations. Direct connections become important when bootstrap bandwidth becomes a bottleneck or the network grows significantly.

**Problem:** Stations behind NAT firewalls rely on the bootstrap node (`bootstrap.wesense.earth`) as a GossipSub relay for OrbitDB database replication. All traffic routes through a central point — defeating the purpose of a decentralised architecture. The goal is direct P2P connections where possible, falling back to relay only when direct connection fails.

**Current state:**

- **LAN discovery**: mDNS works — stations on the same network find each other directly
- **WAN discovery**: Stations connect outbound to the bootstrap node; OrbitDB replicates via GossipSub through it
- **No hole punching**: libp2p's DCUtR (Direct Connection Upgrade through Relay) protocol is not enabled
- **No circuit relay**: The bootstrap node does not act as a libp2p circuit relay v2

**TODO:**

1. **Enable DCUtR (Hole Punching)** — Add `@libp2p/dcutr` to OrbitDB's libp2p configuration. Requires the relay node to support `circuitRelayServer`. Works with most consumer NATs (cone NAT), may fail with symmetric NAT.

2. **Enable Circuit Relay v2 on Bootstrap** — Configure the bootstrap node as a `circuitRelayServer` so it can broker relay connections. Peers advertise relay addresses, other peers connect through the relay, DCUtR then upgrades to direct.

3. **AutoNAT Detection** — Add `@libp2p/autonat` so nodes know whether they're publicly reachable and can decide whether to advertise direct or relay addresses.

4. **Zenoh Data Path (Separate Concern)** — OrbitDB replication is low bandwidth. The bigger concern is Zenoh live sensor readings. Options: Zenoh's own NAT traversal (`zenoh-plugin-webserver` or relay nodes), routing Zenoh through libp2p transport, or accepting relay-based flow initially.

**Note:** For the Iroh archive path, NAT traversal is handled separately via self-hosted DERP relays (`IROH_RELAY_URLS`). See `IrohPlan.md` Step 9.
