# P2P Network

Two independent P2P networks, each serving a distinct purpose:

- **Eclipse Zenoh (Live data transport):** Real-time pub/sub with native wildcard key expressions and distributed Queryables. Ingesters publish SignedReading protobuf messages to geographic key expressions (e.g., `wesense/v2/live/nz/auk/*`). Consumers subscribe to regions of interest. Queryables enable distributed queries for choropleth data, device lists, and late-joiner catchup. Operates via community-run `zenohd` routers and direct peer connections.

- **OrbitDB on Helia/libp2p (Synchronized state, port 4002):** CRDT-based database for node registry, trust list, and store scopes. Every participant holds a full local replica, synced via GossipSub delta propagation. This is a **private WeSense P2P network** — it does not connect to the public IPFS DHT or bootstrap nodes. Every peer on this network is another WeSense station. Peer discovery: LAN via mDNS (`network_mode: host`), WAN via `ORBITDB_BOOTSTRAP_PEERS` (direct dial to known stations). Provides an independent network entry path from Zenoh — if Zenoh routers are unavailable, stations can still reach each other via the OrbitDB libp2p network, replicate the registry, and find peer addresses. OrbitDB only manages small, station-bounded state — it does not handle archive storage or attestations.

- **Storage Broker + Archive Replicator (Historical archives, ports 8080 + 4400):** The storage broker (`wesense-storage-broker`) receives readings, writes to ClickHouse, and serves Parquet archives over HTTP. The archive replicator (`wesense-archive-replicator`) provides BLAKE3 content-addressed blob storage with gossip-based P2P replication announcements. Each archive bundles signed readings (Parquet with signature columns), a trust snapshot (public keys), and a signed manifest (content hash + archiver identity). Archives are content-addressed (BLAKE3) — identical data always produces the same hash, providing immutability and implicit verification when multiple archivers independently produce the same result. Parquet files are self-describing and can be queried directly by ClickHouse (via `url()`), DuckDB, Pandas, Spark, etc. Researchers can verify every reading offline using only the bundled trust snapshot. See Sections 5.6 and 5.7.
  
  > **Why is OrbitDB separate from the storage broker?** They serve fundamentally different purposes. Helia/libp2p on port 4002 forms a **private WeSense network** for OrbitDB state synchronization — only WeSense stations connect, no public infrastructure involved. The storage broker on port 8080 + archive replicator on port 4400 handle archive storage and HTTP serving. OrbitDB does not store archive content. The storage broker does not manage trust or node registry. They are independent systems.

## Node Discovery & State Synchronisation (OrbitDB)

This section explains how the OrbitDB/libp2p network discovers peers, decides who to talk to, and keeps state consistent across the network — including at very large scale.

Live sensor data does **not** flow through this layer — that's Zenoh. Archive replication does **not** flow through this layer — that's the archive replicator over iroh. OrbitDB handles only the small shared state the network needs to operate: the node registry and the trust list.

### The three layers of the P2P stack

OrbitDB sits on top of Helia (js-libp2p with no public IPFS connections). Three conceptually separate things happen:

1. **Discovery — finding out that a peer exists and where to reach it.**
   - **mDNS** on a LAN finds other WeSense stations on the same subnet automatically.
   - **Bootstrap peer list** (`ORBITDB_BOOTSTRAP_PEERS`) — a small seed list of stations to dial at startup to get into the network.
   - **`wesense.nodes` OrbitDB database** — the canonical registry of every station in the network. Once a station has synced this database (via CRDT replication from any connected peer), it knows every other station's peer ID and `ANNOUNCE_ADDRESS`. This is WeSense's primary peer-discovery mechanism.

2. **Connection — establishing a libp2p session to a specific peer.** Direct QUIC/TCP wherever possible. For stations behind strict NAT, DCUtR hole-punching can coordinate a direct connection via a mutually-reachable third party (hole-punching only, not a traffic relay). Stations that can't be directly reached even with DCUtR are not full P2P participants — they should use the public MQTT contributor path instead. See [NAT Traversal](#nat-traversal-for-direct-station-to-station-connections) for the roadmap and the architectural decision not to run circuit-relay v2 as a proxy.

3. **GossipSub mesh — the set of peers you actually exchange messages with.** Each station maintains a **mesh** of `D` direct peers per topic (libp2p default `D=6`). Messages flood through the mesh with deduplication by message ID. Peers outside the mesh are known but not directly gossiped with — they're eligible to join the mesh if current members become unreliable.

### WeSense-native peer discovery: event-driven dialer

Standard libp2p discovery mechanisms have limits:

- **mDNS** is LAN-only.
- **Bootstrap list** is manual; requires every operator to know about every other station, which doesn't scale.
- **GossipSub Peer Exchange (PX)** propagates peer records in PRUNE messages — but PRUNE only fires when a mesh is over-sized (more than `D_hi=12` peers), which never happens in networks with fewer peers than the mesh target. At small scale, PX is silent. At large scale it works beautifully.
- **DHT** is the libp2p-native solution for large-scale address lookup, but js-libp2p's DHT is limited (TCP-only, small routing tables) and not the primary mechanism here.

WeSense's native mechanism — which works at any scale from three stations to millions — uses the `wesense.nodes` OrbitDB database directly:

1. **Every station registers itself** in `wesense.nodes` with its peer ID, `ANNOUNCE_ADDRESS`, role, and scope.
2. **OrbitDB CRDT replication** propagates the registry to every station automatically. Connect to any single peer and you converge on the full registry within seconds.
3. **The event-driven dialer** on each station subscribes to `wesense.nodes` update events. When a new record appears (or an existing one changes), the station checks: is this me? am I already connected? is this peer penalised? If none of those apply, it dials the new peer directly.
4. **Bootstrap's role reduces to a pure seed.** A new station only needs one reachable peer in `ORBITDB_BOOTSTRAP_PEERS` to cold-start. Once the initial connection is established and `wesense.nodes` has synced, every subsequent peer dial is driven by registry updates.

This design has several properties worth noting:

- **Single source of truth.** The registry drives who we dial. No parallel peer-list state to keep in sync with the network reality.
- **Push-driven, not polled.** OrbitDB's update events mean new peers are dialed within seconds of their registration propagating — no discovery delay.
- **Compatible with GossipSub PX.** When the mesh gets big enough that PRUNE fires regularly, PX works as an additional propagation channel. It's additive, not alternative.
- **Extensible to trust/quality scoring.** The dial decision includes an `isPenalised()` check — initially a no-op, but a natural hook for the future prioritisation framework (see [Phase 2 Plan §4.4](https://github.com/wesense-earth/wesense-general-docs/blob/main/general/Phase2Plan.md)).

Bootstrap stations that advertise themselves in `wesense.nodes` are no different from any other station in this model. The `ORBITDB_BOOTSTRAP_PEERS` env var becomes a cold-start seed list, not a runtime peer list. The network stops depending on any specific bootstrap being up once `wesense.nodes` has propagated.

### How this scales to millions of stations

The key property is that **gossipsub mesh size is constant regardless of network size.** Each station talks directly to ~6 peers, no matter if the network has 10 stations or 10 million. Messages reach every subscriber in roughly log<sub>D</sub>(N) hops — ~9 hops for a million stations at `D=6`, ~11 hops for ten million. Each station processes only its mesh neighbours' traffic, not the whole network's.

Three further properties make this scale cleanly:

- **Topic sharding.** A single gossipsub topic subscribed to by a million stations is unworkable traffic. WeSense topics are partitioned by region and purpose — e.g. a guardian in New Zealand subscribes to `nz/*` topics but not `de/*`, and each topic has its own mesh. Each station participates in only the meshes it cares about. See the [Scale & Partitioning](/architecture/scale-and-partitioning) architecture doc for the sharding model.
- **Registry sharding.** At very large scale, every station holding the full global `wesense.nodes` registry becomes impractical. The registry will shard the same way topics do — a station stores/replicates the registry entries for regions it cares about, plus a small set of cross-region bootstrap seeds. This is future work.
- **Eventually-consistent state, not authoritative data.** The data OrbitDB carries is **CRDT-based** — every peer holds a full replica of the registry (scoped appropriately at scale), and replicas merge cleanly without needing a single authoritative source. There is no "which peer has the most up-to-date data" question to resolve at the peer-selection layer — all peers converge on the same state, so any peer is a valid source. See the [Governance & Trust](/architecture/governance-and-trust) page for what that state looks like.

In short: at scale you don't "choose one peer out of a million to talk to." You maintain a stable gossipsub mesh of a handful of peers (chosen by gossipsub's own scoring), the registry-driven dialer keeps you connected to a broader set of known-good stations you've discovered via the shared registry, and the gossip tree handles network-wide reach. State consistency is handled above the peer layer by CRDTs.

### Current deployment status

- ✅ **`ORBITDB_BOOTSTRAP_PEERS` seed** — supports comma-separated list of multiaddrs / hostnames; used only for cold-start.
- ✅ **mDNS on LAN** — `@libp2p/mdns` for automatic same-subnet discovery.
- ✅ **`wesense.nodes` registry** — every station's OrbitDB peer self-registers on startup with its `announce_address` and libp2p peer ID.
- ✅ **GossipSub Peer Exchange (doPX)** — enabled. Active at large-network scale where PRUNE fires; quiet at our current small scale.
- ✅ **Event-driven dialer from `wesense.nodes` updates** — subscribes to OrbitDB update events; dials any newly-announced peer that isn't ourselves and isn't already connected.
- ✅ **Iteration tolerance for orphan blocks** — see "Resilience at scale" below.
- ✅ **Network-presence-aware registry cleanup** — see "Registry maintenance" below.
- 🧭 **Trust / quality prioritisation framework** — designed as a future hook on the event-driven dialer. See [Phase 2 Plan §4.4](https://github.com/wesense-earth/wesense-general-docs/blob/main/general/Phase2Plan.md).
- 🧭 **Sync-time availability check** — prevents poison-entry replication. See "Resilience at scale" below for the layered model and where this fits.
- 🧭 **DCUtR hole-punching for strict-NAT stations** — deferred; lower priority than the registry-based dialer.
- ❌ **Circuit-relay v2 as traffic proxy** — deliberately rejected. Stations that cannot be directly reached do not get proxied through relays; they participate as contributors via public MQTT instead.

---

### Resilience at scale: handling unfetchable references

This is one of the harder problems for any content-addressed P2P data store, and worth understanding in detail because the way we handle it determines whether the network stays operable at large scale.

#### The underlying problem

OrbitDB stores its oplog as a Merkle DAG. Each entry references its parent entries via cryptographic hashes (CIDs). Verifying or iterating the oplog requires fetching the bytes at each referenced CID — either from local disk (if we have it) or from peers via libp2p bitswap (if we don't).

This works perfectly when every CID a peer advertises is fetchable from somewhere. It breaks when **a peer advertises an entry whose referenced CID is not retrievable from anywhere on the network**. We call these "orphan blocks" or "poison entries".

Causes of orphan blocks include:
- A peer wrote an entry, then went offline before any other peer synced the referenced block from it
- A peer's storage was wiped or its data corrupted
- Past bugs caused entries to be written without their referenced blocks being properly stored (the original WeSense incident: a now-fixed helia v6 streaming-blockstore incompatibility produced entries that referenced blocks no peer ever had)
- Network partitions during sync left receiving peers with partial state

In a small lab network this is a one-time corruption event. **At million-node scale it is baseline behaviour** — the rate of "peer goes offline before its blocks propagate" is non-zero and cumulative. A system that treats unfetchable references as a catastrophic failure breaks continuously at scale; one that treats them as a normal degraded state stays operable.

The TTL fork addresses the LONG-TERM accumulation (entries older than 30 days get filtered out at read time), but does nothing for entries that are orphaned mid-flight. And once a poisoned peer syncs to a clean peer, the clean peer inherits the poison and starts presenting the same problem to whoever syncs next. Without further protection, **the contagion is permanent**.

#### Four-layer architecture

A network that handles this gracefully needs four complementary layers, each addressing a different failure mode. We've shipped some, others are planned. All four documented for posterity in [Phase 2 Plan §4.4](https://github.com/wesense-earth/wesense-general-docs/blob/main/general/Phase2Plan.md).

| Layer | Purpose | WeSense status |
|---|---|---|
| **0. Iteration tolerance** | Skip entries whose blocks can't be fetched within a short timeout, log a warning, return what's available. Iteration completes with partial results instead of hanging. | ✅ Shipped |
| **1. Sync-time availability check** | Reject incoming entries during peer sync if the sender can't produce the referenced blocks. Stops poison from spreading. | 🧭 Planned |
| **2. Trust / quality prioritisation** | Score peers by how often they advertise unresolvable references; deprioritise or quarantine repeat offenders. | 🧭 Planned (designed) |
| **3. Local oplog self-cleanup** | Periodically tombstone entries whose referenced blocks have been confirmed unfetchable. Bounds local state regardless of network history. | 🧭 Planned |

#### Layer 0 in depth — iteration tolerance (shipped)

Implemented in the WeSense OrbitDB fork. Two specific code paths were patched, both in `src/oplog/`:

**`traverse()` in `log.js`** is the workhorse function that walks the oplog DAG to enumerate entries. It's called by `iterator()` which is called by the Documents `all()` method which is called by every read endpoint (`GET /nodes`, `GET /trust`, our registry-driven dialer's startup walk). Patched to wrap each entry fetch in a 2-second timeout via `safeFetchEntry()`. Failed fetches return `null`, which the calling logic filters out before continuing. The traversal completes with whatever entries were fetchable; entries whose blocks are unreachable are logged once (rate-limited per hash) and skipped.

**`heads()` in `oplog-store.js`** is the entry-point function that returns the current "tip" entries of the oplog — the starting points for any traversal. Without tolerance here, a single unfetchable head entry would throw the whole `heads()` call, and `iterator()` would never even start. Patched the same way: each head's block fetch is wrapped in a 2-second timeout via `safeGetHead()`. Heads whose blocks can't be fetched are skipped; traversal proceeds from whatever heads ARE reachable.

The combination means iteration succeeds even when some heads or some intermediate entries reference orphan blocks. The cost is incompleteness — we can't yield an entry whose content we can't decode — but completeness was already impossible. The choice is between "incomplete results" and "no results, indefinite hang". Incomplete is correct.

**Test coverage:** all 562 existing OrbitDB tests pass with the patches in place; no behaviour change for healthy entries.

**Operational signal in logs:**
```
[orbitdb log /orbitdb/...] entry zdpu... unavailable during traversal: timeout after 2000ms
[orbitdb oplog-store] head zdpu... unavailable: timeout after 2000ms
Registry walk: 14 entries | 1 considered | 12 no announce_address | 1 internal (3527ms)
```

The registry walk completes; entries that can't be processed are explicitly counted.

#### Why each layer matters at scale

Without layer 0: any single bad entry breaks every read, on every station that has it.

Without layer 1: bad entries spread to every clean peer that syncs from a dirty one. Eventually the entire network is dirty.

Without layer 2: each peer wastes resources on repeatedly trying to fetch from sources that have demonstrated they can't help. Bandwidth, CPU, and log volume scale poorly.

Without layer 3: local storage grows unboundedly with all-time history, even after entries become permanently inert.

At 4 stations only layer 0 matters in practice. At 1M stations all four are needed.

---

### Registry maintenance

The `wesense.nodes` registry is the source of truth for "who is on the network and how do I reach them". A few mechanisms keep it healthy.

#### Self-registration

On startup, each `wesense-orbitdb` peer writes its own record to `wesense.nodes` with:

- `_id` and `ingester_id` set to the libp2p peer ID
- `announce_address` set from the `ANNOUNCE_ADDRESS` env var
- `type: 'orbitdb-peer'`
- `updated_at` set to startup time

This is intentionally **once per startup** rather than periodic. The reasoning:

1. Catches changes — a new value of `ANNOUNCE_ADDRESS` takes effect on next restart, which is when the registry should update.
2. Avoids continuous oplog growth — at 1M peers, hourly re-registration would produce 1M extra oplog entries every hour, all of them carrying no new information.

The trade-off: a peer running continuously past `NODE_TTL_DAYS` would have its registration aged out of the cleanup loop's view, even though the peer is still actively present. The next mechanism addresses this.

#### Presence-aware cleanup

A periodic cleanup loop (`cleanupStaleNodes`, hourly by default) prunes registry entries that we genuinely haven't heard from within `NODE_TTL_DAYS`. "Heard from" means **either**:

1. The entry's own `updated_at` is within the window (the writer has refreshed it), **or**
2. The entry's `ingester_id` matches a libp2p peer ID we've seen on our network (`peer:connect` event) within the same window.

(2) is tracked in a local in-memory map (`lastSeenPeers`) that records the most recent contact time per peer ID. Updated on every `peer:connect` event. The map is local-only — not replicated — so each station maintains its own view of which peers it has personally observed.

This makes the cleanup semantic match what operators expect: **a peer that's actively present on the network is not pruned from the registry just because it hasn't restarted lately**. The TTL is a "we haven't heard from you in N days" signal, not a "you haven't bothered to re-write your registration" signal.

A peer that genuinely disappears (offline beyond `NODE_TTL_DAYS`, no peer:connect events received) is pruned, as it should be — its entry is no longer useful to anyone.

CRDT semantics make local prunes safe: if station A prunes a peer's entry but station B still sees it, the entry replicates back to A from B. Pruning is a local cleanup, not a network-wide deletion. Network state converges.

#### lastSeenPeers garbage collection

The `lastSeenPeers` Map only ever grows in the absence of explicit cleanup. A peer connected once, then never again, would stay in the Map indefinitely. At million-peer scale over months of process uptime that's substantial memory.

A separate hourly GC sweep removes `lastSeenPeers` entries older than `NODE_TTL_DAYS`. Entries beyond that window are functionally inert — they couldn't keep a registry entry alive (the cleanup loop uses the same cutoff), so removing them changes nothing operationally.

The Map size is therefore bounded to "peers seen in the last N days", not "all peers ever seen". At any scale, memory tracks the active working set rather than cumulative history.

---

### The WeSense OrbitDB fork

[OrbitDB](https://github.com/orbitdb/orbitdb) is a peer-to-peer database that sits on top of libp2p and IPFS-compatible blockstores. It provides CRDT-based data types (KeyValue, EventLog, Documents, etc.) where every peer holds a full local replica and replicas converge on the same state via delta propagation over gossipsub.

WeSense uses OrbitDB Documents databases for two small, shared states:

- `wesense.nodes` — the node registry. Stations, ingesters, archive replicators all register their endpoints here. Other services read it to discover where to send things.
- `wesense.trust` — the trust list. Ed25519 public keys that are authorised to sign sensor readings.

(A previous third database `wesense.attestations` for archive integrity proofs has been retired in favour of the iroh archive replicator's index-as-a-blob mechanism — see the Distribution Layer section below.)

OrbitDB is well-suited for these states: they're small, bounded, rarely written to, full replication is cheap, and CRDT convergence means operators don't have to think about partitions, split-brain, or consensus.

#### Why we maintain a fork

WeSense runs a fork of `@orbitdb/core` at [`github.com/wesense-earth/orbitdb`](https://github.com/wesense-earth/orbitdb). The fork carries WeSense-specific patches that aren't (yet) in upstream. We deliberately keep each upstream-PR-able patch on its own focused branch, with an integration branch that production pins to.

##### Branch structure

```
upstream/main ────────────────────────────────────────
                 \           \
                  \           \── feat/ttl ── (TTL + helia v6 compat)
                   \                                    ↑ submitted as upstream PR
                    \── feat/iteration-tolerance ── (orphan-block tolerance)
                                                        ↑ ready for upstream PR

         wesense-main ── (integration: merges all WeSense patches)
                          ↑ wesense-orbitdb production pins here
```

**Why an integration branch:** each `feat/*` branch needs to be cleanly upstream-PR-able — reviewers for one shouldn't have to wade through unrelated WeSense patches. So each `feat/*` branch is single-concern, rebased on upstream main where possible. But production needs ALL the patches simultaneously, so `wesense-main` is the union, and `wesense-orbitdb`'s `package.json` pins to it.

When upstream accepts a patch, we drop it from `wesense-main` and rely on the next upstream release. The feature branch can be archived. Over time the divergence shrinks.

##### Patches currently in the fork

**1. TTL support** (`feat/ttl` branch — also includes the helia compat shim that originally shipped with it)

Adds a `ttl` option to `Log()` constructor and a corresponding `isExpired(entry)` filter applied during oplog traversal. Entries older than the TTL are silently skipped during reads. A compact() function reclaims disk by removing expired entries from the blockstore.

The helia v6 streaming-blockstore compatibility patch is bundled in the same branch (a small fix in `IPFSBlockStorage` to handle both the legacy `Promise<Uint8Array>` and the new `AsyncGenerator<Uint8Array>` return types).

Already submitted as upstream PR.

**2. Iteration tolerance** (`feat/iteration-tolerance` branch — based on `feat/ttl` so the TTL-specific paths are also patched)

Adds `safeFetchEntry()` in `src/oplog/log.js` and `safeGetHead()` in `src/oplog/oplog-store.js`. Both are timeout-guarded wrappers around the underlying `get(hash)` call, returning `null` and logging on timeout/failure rather than throwing. Used inside `traverse()` and `heads()` respectively, both at the lowest level where block fetches actually happen.

The patch is purely additive — healthy entries iterate exactly as before, with no behavioural change. Only entries whose blocks can't be fetched in 2 seconds are skipped. All 562 existing tests pass unchanged.

Ready for upstream PR; held pending production validation.

##### Upstream PR strategy

Each fork patch is designed to be upstreamable as a focused improvement to `orbitdb/orbitdb`. We do NOT submit WeSense-specific behaviour upstream — those concerns live in `wesense-orbitdb` (see below). Upstream PRs are sent only for changes that benefit any OrbitDB user, not just WeSense.

Patches we maintain locally and don't intend to upstream (because they're WeSense-specific):
- Self-registration of orbitdb-peer entries in `wesense.nodes` (lives in `wesense-orbitdb`, not the fork)
- Network-presence-aware registry cleanup (also `wesense-orbitdb`, not the fork)
- Anything that depends on `wesense.nodes`'s specific schema

#### `wesense-orbitdb` vs the fork

It's worth being clear about which code lives where:

| Concern | Lives in |
|---|---|
| Generic OrbitDB behaviour (databases, oplog, sync, replication) | The fork |
| Iteration tolerance, heads tolerance, TTL | The fork (upstream-PR-able) |
| Helia v6 compatibility | The fork (upstream-PR-able) |
| WeSense database schemas (`wesense.nodes`, `wesense.trust`) | `wesense-orbitdb` |
| Self-registration on startup | `wesense-orbitdb` |
| `lastSeenPeers` map and presence-aware cleanup | `wesense-orbitdb` |
| Registry-driven peer dialer | `wesense-orbitdb` |
| HTTP API (`/nodes`, `/trust`, `/health`) | `wesense-orbitdb` |
| Helia/libp2p configuration and lifecycle | `wesense-orbitdb` |
| Gossipsub stream-zombie sweep | `wesense-orbitdb` |

The fork is the data store; `wesense-orbitdb` is the WeSense-specific service that consumes it.

#### Contributing changes

If you find a bug or want to add a feature:

- **Bugs/features in core OrbitDB** (something any OrbitDB user would want): branch from upstream `main` in `wesense-earth/orbitdb`, develop the change, cherry-pick or merge into `wesense-main` for production, and submit upstream PR from your clean branch when ready.
- **WeSense-specific behaviour**: live in `wesense-orbitdb`, not the fork. The fork should stay generic.

For background on OrbitDB's architecture, CRDTs, and access-control primitives, see the [OrbitDB project](https://github.com/orbitdb/orbitdb) directly — that material is well-documented upstream and not reproduced here.

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
