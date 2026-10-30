# Run a Bootstrap Node

A bootstrap node is a publicly-reachable peer that helps new stations find existing ones when they first come online. It's a small, optional role that makes the P2P network snappier, especially for stations coming up for the first time or behind NAT.

## What a bootstrap actually does

When a new station starts, it needs to find at least one other peer on the WeSense P2P network before it can sync the node registry, fetch the trust list, and start gossiping. Several mechanisms exist for this discovery:

- **mDNS** on a LAN finds other stations on the same local network automatically.
- **The P2P DHT** eventually discovers peers via the wider libp2p network.
- **A bootstrap node** — if the new station has a hostname or IP it can dial directly, it gets an instant starting point and skips the "wait for discovery" phase.

A bootstrap node is just a regular OrbitDB peer with two properties:

1. It has a **publicly-reachable address** (via `ANNOUNCE_ADDRESS` — a DNS name or public IP with port 4002 forwarded).
2. Its address is **listed in other stations' `ORBITDB_BOOTSTRAP_PEERS`** env var, so they know to dial it on startup.

That's it. There's no special code-path for "being a bootstrap" — it's just a deployment shape.

## Is it required?

**No.** The WeSense P2P network is designed to function without any dedicated bootstrap — stations can find each other via mDNS on a LAN, via peer exchange through any connected peer, or via the DHT across the internet. A bootstrap just accelerates initial discovery, especially across the WAN, and is particularly helpful for stations behind strict NAT who can't accept inbound connections themselves.

The network should always have at least one reachable bootstrap for good user experience, but it does not depend on any specific one being up.

## Do I already have a bootstrap?

If you run a **guardian** or **hub** profile, **you already run an OrbitDB peer**. Whether you're currently acting as a bootstrap for other stations is a question of two things:

1. Is your `ANNOUNCE_ADDRESS` set to a public hostname, with port 4002 reachable from the internet?
2. Do other stations' `.env` files list you in `ORBITDB_BOOTSTRAP_PEERS`?

If both are yes, you're already a bootstrap — no extra config needed. The `bootstrap` profile is purely for hosts that should do *only* that one job, typically a small VPS with no sensors, no database, and nothing else running.

## When to run a dedicated bootstrap

You might want to run a bootstrap-only deployment (rather than piggy-backing on a guardian/hub) if:

- You have a cheap VPS with a stable public address and spare capacity, but not enough resources to run a full guardian.
- You want a stable, dedicated rendezvous that doesn't go down when you're experimenting with your guardian or hub.
- You want to contribute to network resilience in a region that doesn't yet have well-connected bootstraps.

Running one without a public address doesn't help anyone, so reachability is the prerequisite.

## Resource requirements

A pure bootstrap is light:

| Resource | Minimum | Comfortable |
|----------|---------|-------------|
| RAM | 1 GB (tight — GC pressure slows sync) | **2 GB or more** |
| CPU | 1 vCPU (GC pauses block everything) | 2 vCPU |
| Disk | 20 GB NVMe | 40 GB+ NVMe |
| Network | ~10 GB/month metadata | Low — bootstraps don't shuttle bulk data |

The live state is tiny (a node registry and trust list, kilobytes for a small network), so a 2 GB / 2 vCPU VPS is comfortable. OrbitDB keeps its history as an append-only log and never removes old entries from disk, so growth depends on how often nodes write. Keep the disk at the size above and see [Disk housekeeping](#disk-housekeeping).

## Setting one up

1. **Provision a host.** A small VPS with a public IPv4 address. A few providers have sensibly-priced plans at the 2 GB / 2 vCPU / 40 GB NVMe mark.

2. **Install Docker and Docker Compose.** Standard distro packages or Docker's official install script.

3. **Clone the `wesense` repo:**
   ```bash
   git clone https://github.com/wesense-earth/wesense.git
   cd wesense
   cp .env.sample .env
   ```

4. **Configure `.env`** with at minimum:
   ```
   COMPOSE_PROFILES=bootstrap
   ANNOUNCE_ADDRESS=bootstrap.example.org    # your public DNS name
   ORBITDB_BOOTSTRAP_PEERS=bootstrap.wesense.earth,another-peer.example.org
   ORBITDB_HEAP_MB=1024                      # see .env.sample for tuning notes
   TZ=Pacific/Auckland                       # or your local zone
   ```
   If you're on a well-resourced box (8 GB+ RAM), you can afford a more generous `ORBITDB_HEAP_MB`. See the full annotated `.env.sample` for guidance.

5. **Set up a DNS record** pointing your chosen hostname at the VPS's public IP.

6. **Open port 4002** on your firewall / security group — TCP inbound for libp2p.

7. **Bring it up:**
   ```bash
   docker compose up -d
   ```

8. **Ask other station operators** to add your hostname to their `ORBITDB_BOOTSTRAP_PEERS`. Until some stations do this, you're reachable but not actually being *used* as a bootstrap.

## Monitoring

A healthy bootstrap shows steady OrbitDB memory usage (RSS stays within your `ORBITDB_HEAP_MB` cap plus modest C++ overhead), a handful of connected peers, and near-zero `Peer disconnected` events once the network has settled.

Check with:

```bash
docker stats wesense-orbitdb
docker logs -f wesense-orbitdb
# Disconnect rate over the last hour (expect 0 on a steady network):
docker logs --since 1h wesense-orbitdb 2>&1 | grep -c 'Peer disconnected'
```

If RSS climbs steadily over days, consider lowering `ORBITDB_HEAP_MB` to force earlier GC (bigger is not better — see the `.env.sample` notes). If you see a non-trivial ongoing disconnect rate, check that `CONNECTION_MONITOR_ENABLED` isn't set to `true` in your `.env` — see [the stream-reset investigation](https://github.com/wesense-earth/wesense-general-docs/blob/main/general/StreamResetInvestigation.md) for why that default matters.

## Disk housekeeping

A bootstrap on a small root disk (the 8.7 GB IONOS image, for example) can fill up and then block `apt` upgrades. The OrbitDB data directory (`data/orbitdb`) is the live Helia datastore and blockstore, so **never delete it to make room** (it also holds `peer_key`, so wiping it changes the bootstrap's peer ID). Everything else on the box is operating-system and Docker clutter that you should keep trimmed:

| Source | Typical size | Fix |
|--------|--------------|-----|
| Old Docker images (`:dev`, superseded `:latest`) | 1.3 GB each | `docker image prune -a -f` after the stack is up (running images are kept). Do this after every `docker compose pull` |
| systemd journal | 400 MB+ | Set `SystemMaxUse=100M` in `/etc/systemd/journald.conf`, then `sudo systemctl restart systemd-journald` |
| Old kernels and headers | ~340 MB each | After rebooting into the new kernel: `sudo apt-get autoremove --purge`, then `sudo apt-get clean` |
| snapd (unused on a server) | 200 MB+ | `sudo apt-get purge snapd` if nothing you run depends on it |
| apt lists and cache | 440 MB | `sudo apt-get clean` |

Keep roughly 1.5 GB free before starting an `apt upgrade`, because kernel packages unpack to several hundred MB. Check usage with `df -h /` and `sudo du -xh --max-depth=2 / | sort -h | tail -20`.

### Why `data/orbitdb` can grow, and the fix

OrbitDB's log is append-only and upstream has no expiry or compaction (tracked in [orbitdb/orbitdb#1251](https://github.com/orbitdb/orbitdb/issues/1251), with a TTL patch in PR #1252). Every entry is stored as a pinned block, and nothing frees it. Before `wesense-orbitdb` PR #48, every node also wrote a `__sync__` marker entry every 10 minutes and on every peer connect, so a bootstrap reached about 3 GB against about 13 MB of live state and filled its 8.7 GB disk.

Since PR #48 the marker is off by default (`SYNC_MARKER_ENABLED=true` turns it back on, which you shouldn't do on a bootstrap). Growth is now limited to real changes to node records.

To reclaim space on a host that ran the old image, once it is on the new one:

1. `cd` to your `wesense` checkout and run `docker compose stop orbitdb`.
2. Remove `data/orbitdb/blockstore`, `data/orbitdb/datastore` and `data/orbitdb/orbitdb`. **Keep `data/orbitdb/peer_key`** so the peer ID stays the same.
3. Run `docker compose up -d orbitdb`. The node re-syncs the registry from its peers in seconds.

Check `du -sh data/orbitdb` monthly. If it climbs again, the remaining cause is the log never being pruned from disk (the issue linked above).

## Operational practice

- **Upgrade carefully.** Stations rely on a stable bootstrap peer ID; changing it (by wiping the OrbitDB data volume) forces reconnection everywhere. A rolling update is fine; a data-wipe is disruptive.
- **Public-facing but minimal.** Keep this box lean. Don't co-tenant it with services that might consume resources unpredictably — bootstrap stability is shared-fate with the whole network.
- **Geography matters.** If you're adding a second bootstrap for redundancy, put it in a different datacentre / country than the first. Two bootstraps in the same DC is only *half* the redundancy.

## Future: relay nodes

A related role — libp2p **relay nodes** — is on the WeSense roadmap but not yet deployed. A relay would let stations behind strict NAT or CGNAT be reached *through* the relay without needing their own public address. Bootstrap and relay are deliberately separate roles: bootstrap is a short-lived rendezvous (small resources), relay is a long-lived data transit path (more resources, different trust implications). See the general docs for the current design thinking.
