# Respiro Query Performance

Respiro is meant to run on modest hardware, down to a Raspberry Pi. ClickHouse is fast because it can skip data, not because it reads everything quickly. This page records the rules Respiro's queries follow so they stay fast as the archive grows, and the measurements behind them.

## How `sensor_readings` is laid out

`wesense.sensor_readings` is a `ReplacingMergeTree` ordered by `(device_id, reading_type, timestamp)`, with a 3-year TTL. ClickHouse can skip blocks of rows that cannot match a filter on those columns:

- **A filter on `device_id`** reads only those devices' rows. This is the cheapest filter there is.
- **A filter on `timestamp`** (e.g. the last 24 hours) skips older data.
- **No filter** reads every row ever stored. The cost grows every day.

## Rules

1. **Never query the whole network without a time window.** "Latest reading for every sensor" over all time reads the entire table.
2. **When the user has chosen sensors, filter by `device_id`.** All-time queries are cheap when they are limited to a few devices, so "show my sensors even if they went quiet months ago" is affordable.
3. **`'all'` is always bucketed.** For sparklines and history charts, `'all'` uses weekly buckets. Raw points over all time either sort the entire table (network-wide) or ship every reading a sensor ever sent (one sensor's chart: about 80,000 points per reading type for a sensor that has reported every 5 minutes for a year).
4. **Unknown time ranges are rejected, not defaulted.** A range Respiro does not recognise is an error that names the accepted formats. Units are `m` minutes, `h` hours, `d` days, `w` weeks, `M` months, `y` years.
5. **Values from requests are passed as query parameters, never pasted into SQL.** Device IDs, reading types and deployment types go in as `{name:Type}` parameters, so a crafted value cannot change the query.

## The Dashboard (`/api/sensors?devices=...`)

The Dashboard shows the sensors a user has favourited. It asks for just those devices:

- **Latest readings:** all time, filtered by `device_id`. A favourite that stopped reporting still appears.
- **Sparklines and pressure trend:** the last 24 hours, filtered by `device_id`.
- **Swarm statistics** (H3 cell median, outliers, peer list): computed from the whole network's last 24 hours. Only sensors that reported recently (within their source's freshness threshold, at most about an hour) count towards a swarm, so a 24-hour window loses nothing.

Before this, the Dashboard requested `/api/sensors?range=all`. That returned every sensor in the network over all time, with an unbucketed sparkline query that sorted the entire table, and the browser then discarded everything except the favourites.

### Measured on a 4-core i5-7500 guardian (20.6M rows, 9,095 devices, November 2026)

| Query | Old dashboard | New dashboard |
|---|---|---|
| Latest readings | 4.7 s (whole network, all time) | 0.40 s (network, 24h) + 0.32 s (favourites, all time) |
| Deployment types | 1.2 s (whole network, all time) | 0.97 s (whole network, all time) + 0.12 s (favourites) |
| Sparklines | 5.9 s (whole table sorted) | 0.06 s (favourites, 24h) |
| Response size | 20.5 MB | a few KB |
| End-to-end request | 14–15 s | about 1 s |

For comparison, the weekly-bucketed `'all'` sparkline over the whole network takes 1.9 s. It is still a full read, which is why no view should ask for it.

## Remaining full-history reads

These still read all history on every call and grow with the archive:

- **Deployment-type backfill** (`queryDeviceDeploymentTypes` with no device filter). Each sensor's deployment type (indoor/outdoor/mixed) is taken from its most recent row that has one, across all time. It runs on every `/api/sensors` call, map and dashboard.
- **`/api/devices`**, the list behind "Add Sensors" search (3.9 s, 4.5 MB on the machine above).

The planned fix for both is the latest-per-sensor table below.

## Planned: latest-per-sensor table

**Status:** proposed, not built. This section records the design and its consequences before any code is written.

### What it is

A second, small ClickHouse table holding one row per `(device_id, reading_type)`: the most recent value, its timestamp, and the device's metadata (name, position, source, board, units). Its size depends on the number of sensors, not on how much history is stored: about 100,000 rows for 9,000 sensors, whether `sensor_readings` holds one month or three years.

"Latest reading for every sensor" then becomes a read of that small table instead of a scan of all history. The map, the Dashboard, the "Add Sensors" list and the deployment-type lookup would all use it.

### How rows get there

No WeSense service writes to it. ClickHouse maintains it as a **materialised view**, which behaves like an insert trigger:

- Every `INSERT` into `sensor_readings` also runs a small query over just the inserted batch and writes the result into the latest table, as part of the same insert.
- If that step fails, the insert fails. The two tables cannot silently drift apart.
- The table keeps the newest row per sensor and reading type by `timestamp` (an `AggregatingMergeTree` with `argMax` state, or a `ReplacingMergeTree` versioned on `timestamp`). A reading that arrives late, or twice, never replaces a newer one.

### Every write path feeds it

| Path | Writes with | Feeds the latest table |
|---|---|---|
| Storage broker (this station's ingesters) | `INSERT` | Yes |
| Live transport, inbound from other stations over Zenoh (`received_via = 'p2p'`) | `INSERT` | Yes |
| Any future import of archives into ClickHouse | `INSERT` | Yes, automatically |
| Deployment classifier (deployment type, node name, position) | `ALTER TABLE … UPDATE` | **No** |

### The catch: the deployment classifier

A materialised view sees only inserts. The deployment classifier does not insert; it rewrites existing `sensor_readings` rows in place with `ALTER TABLE … UPDATE` (a ClickHouse *mutation*). Those changes would never reach the latest table, which would keep showing a sensor's old or empty deployment type.

The same pattern is why Respiro needs a full-history lookup for deployment types today. Mutations are also expensive: each one rewrites every data part that contains the device, which on a Raspberry Pi means rewriting large parts of a 20-million-row table.

So the classifier changes first. It writes its results (deployment type, name, position, and their source) to a small table of its own, one row per device, with an `INSERT` per decision. Respiro reads deployment types from there instead of from `sensor_readings`. The classifier's results are already shared between guardians as an iroh blob, so this changes where they are stored locally, not how they replicate.

### P2P and archives

- The latest table is **local and derived**. It is never archived, never replicated and never sent over Zenoh or iroh.
- Each station builds its own from whatever reaches its `sensor_readings`, so it reflects exactly what that station has received, as Respiro does today.
- Parquet archives, signatures, Zenoh and iroh are unchanged. No protocol or archive format changes.
- A station that rebuilds its ClickHouse rebuilds the latest table in the same way (see backfill below).

### Existing data

A materialised view only sees inserts made after it is created. Creating it on a station with existing data needs a one-off backfill: a single `INSERT … SELECT` over all of `sensor_readings`, the same full scan Respiro pays on every page load today, paid once. The migration runs it.

### Expiry

`sensor_readings` deletes rows older than 3 years (its TTL). The latest table does not inherit that rule. Without its own expiry, a sensor that went silent years ago, and whose readings have all been deleted, would stay in the latest table forever. It gets a matching rule: drop a row once its `timestamp` is older than the `sensor_readings` TTL.

### Rollout

- Schema: a new migration in `wesense-clickhouse-live`, copied into `wesense/clickhouse/migrations`, so every station gets it on upgrade.
- Order: (1) classifier writes to its own table and Respiro reads deployment types from it; (2) add the latest table with its backfill; (3) switch Respiro's latest-reading queries to it.
- Each step works on its own and can be released separately.
