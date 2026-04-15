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
| RAM | 1 GB (tight, likely to stream-reset under load) | **2 GB or more** |
| CPU | 1 vCPU (GC pauses block everything) | 2 vCPU |
| Disk | 20 GB NVMe | 40 GB+ NVMe |
| Network | ~10 GB/month metadata | Low — bootstraps don't shuttle bulk data |

Bootstrap state grows slowly over time (OrbitDB oplog entries: nodes, trust, attestations) but the working set stays small. A 2 GB / 2 vCPU VPS is comfortable for years of growth at current network scale.

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

A healthy bootstrap shows steady OrbitDB memory usage (RSS stays within your `ORBITDB_HEAP_MB` cap plus modest C++ overhead), a handful of connected peers, and no repeating "stream has been reset" errors in its logs.

Check with:

```bash
docker stats wesense-orbitdb
docker logs -f wesense-orbitdb
```

If RSS climbs steadily over days, consider lowering `ORBITDB_HEAP_MB` to force earlier GC (bigger is not better — see the `.env.sample` notes). If stream-resets appear frequently, your host is likely under-resourced.

## Operational practice

- **Upgrade carefully.** Stations rely on a stable bootstrap peer ID; changing it (by wiping the OrbitDB data volume) forces reconnection everywhere. A rolling update is fine; a data-wipe is disruptive.
- **Public-facing but minimal.** Keep this box lean. Don't co-tenant it with services that might consume resources unpredictably — bootstrap stability is shared-fate with the whole network.
- **Geography matters.** If you're adding a second bootstrap for redundancy, put it in a different datacentre / country than the first. Two bootstraps in the same DC is only *half* the redundancy.

## Future: relay nodes

A related role — libp2p **relay nodes** — is on the WeSense roadmap but not yet deployed. A relay would let stations behind strict NAT or CGNAT be reached *through* the relay without needing their own public address. Bootstrap and relay are deliberately separate roles: bootstrap is a short-lived rendezvous (small resources), relay is a long-lived data transit path (more resources, different trust implications). See the general docs for the current design thinking.
