# Failure Modes & Resilience

A 200-year archival system must degrade gracefully. This section documents what happens when components fail and how the system recovers.

## Storage Broker Unavailable

**Impact:** Readings are not written to ClickHouse or archived. The map shows stale data.

**Degradation:** Ingesters continue publishing to MQTT. The live transport picks up readings and distributes them via Zenoh to remote stations. Readings are not lost — they're on the P2P network and can be ingested by any station that receives them. The originating station buffers readings in the `GatewayClient` buffer (default 10,000 readings) and retries on each flush interval. When the storage broker recovers, buffered readings are flushed.

**If buffer overflows:** Oldest readings are dropped. The deduplication cache means they won't be re-processed even if they arrive again via P2P, so the gap is permanent for that station. Other stations that received the readings via Zenoh will have them.

## ClickHouse Unavailable

**Impact:** The storage broker cannot write readings or build archives. The map has no data to query.

**Degradation:** The storage broker's internal writer buffers rows and retries on each flush interval. Docker healthcheck (`SELECT 1`, 30s interval, 3 retries) detects the failure and marks the container unhealthy. Readings continue flowing through MQTT and Zenoh. When ClickHouse recovers, buffered readings are flushed.

**Data recovery:** If ClickHouse was down long enough that buffers overflowed, the station can recover data from P2P peers. Remote stations that received readings via Zenoh have them in their own ClickHouse. Archive replication provides a second recovery path for any data that was archived elsewhere during the outage.

## EMQX Broker Unavailable

**Impact:** Sensors cannot publish readings. Ingesters cannot subscribe to raw topics. The live transport cannot receive decoded readings for P2P distribution.

**Degradation:** This is a hard failure for the local station — EMQX is the message bus that connects sensors to ingesters. Sensors with local buffering (WeSense firmware) retain readings until MQTT reconnects. Ingesters use paho-mqtt's auto-reconnect with backoff. The live transport reconnects when EMQX returns.

**No cross-station impact:** Each station runs its own EMQX instance. One station's broker going down doesn't affect other stations.

## Zenoh Network Partition

**Impact:** Live P2P data distribution stops. Remote stations don't receive new readings from the partitioned station.

**Degradation:** Local ingestion continues normally — readings still flow to the storage broker and ClickHouse. Only P2P distribution is affected. When connectivity is restored, Zenoh reconnects automatically. There is no historical catchup for live data missed during the partition — Zenoh is a real-time pub/sub system. However, archive replication via iroh-gossip operates independently and will sync any archives produced during the partition.

## OrbitDB Corruption

**Impact:** Node registry, trust list, or other shared state becomes inconsistent.

**Known issue:** Orphaned oplog entries can replicate between peers indefinitely, causing `LoadBlockFailedError` on all peers. This has been mitigated with permanent block blacklisting in the WeSense OrbitDB fork (`wesense-earth/orbitdb#feat/ttl`), write-ahead verification, and TTL support (30-day expiry) to prevent unbounded database growth.

**Recovery:** OrbitDB databases are eventually consistent. If a single node has corrupt state, it can delete its local OrbitDB data directory and re-sync from peers. The 30-day TTL means stale entries expire naturally.

## Ingester Crash

**Impact:** Readings from that data source stop flowing.

**Degradation:** Docker `restart: unless-stopped` policy restarts the ingester automatically. State is preserved via disk caches (position cache for Meshtastic, last-fetch timestamps for polling ingesters). Readings that arrived during the crash are lost unless they're still available from the data source (e.g., a REST API with historical data, or MQTT retained messages).

**Detection:** Readings stopping is visible in the Respiro map (sensors go stale) and in ClickHouse queries (`SELECT max(timestamp) ... GROUP BY data_source`).

## Archive Replicator Unavailable

**Impact:** New archives are not stored or replicated. Existing archives are unaffected (content-addressed, immutable).

**Degradation:** The storage broker queues archive jobs. Readings continue being written to ClickHouse normally. When the replicator recovers, pending archives are built and announced via gossip. Other stations' replicators continue serving existing archives.
