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

## Shared network-wide results

Results that cover the whole network (every device's latest readings for the map, the swarm pool for the Dashboard, the "Add Sensors" device list) are built at most once a minute and shared by every request. Requests that arrive during a build wait for it. Load therefore stays the same however many people are viewing. A failed build is never reused, so errors still reach the caller. The shared endpoints accept only the time ranges the app requests (400 otherwise), so a request cannot create new cache entries or start extra builds.

## Deployment types (migration 010)

Each device's deployment type (indoor/outdoor/mixed/…) comes from the `wesense.device_deployment_types` view:

- **`device_reported_types`**: each device's latest non-empty type as its ingester reported (and signed) it. A materialised view keeps it current on every insert; the migration backfilled it once.
- **`device_classifications`**: the deployment classifier's decisions, one row per decision, the latest per device winning. The classifier records a batch with a single `INSERT`.
- **The view** applies the classifier's precedence: an overriding classification (remote imports, `--overwrite`), then the device's own reported type, then the classifier's suggestion for a device that reports none. A remote classification also supplies a name and position where the device's readings have none.

Before this, the classifier stored each decision by rewriting the device's rows in `sensor_readings` with `ALTER TABLE … UPDATE`, and every reader worked out types by scanning all of `sensor_readings`. On yoda the classifier's startup import alone issued a rewrite every few seconds for hours (2,711 devices); each rewrote 13–87 data parts; it never settled, because P2P readings arrive with a blank type; and it broke the readings' signatures. Readings are now never modified after they are stored.

All of this is local and derived: nothing is archived or replicated. Classifications reach other stations through the classifier's snapshot exchange over iroh, as before.

## Remaining full-history reads

- **`/api/devices`**, the list behind "Add Sensors" search (3.9 s, 4.5 MB on the machine above). It is now built at most once a minute and shared, but each build still scans all history.

The planned fix is the latest-per-sensor table below.

## Planned: latest-per-sensor table

**Status:** proposed, not built. Its prerequisite, moving the classifier off in-place rewrites, is done (migration 010).

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
| Deployment classifier | `INSERT` into its own table (migration 010) | Not needed: it no longer modifies readings |

### The deployment classifier (done)

A materialised view sees only inserts, so it would have missed the classifier's in-place rewrites of `sensor_readings`. That was the prerequisite for this table, and it is done: the classifier now records decisions in its own table (see *Deployment types* above) and readings are never modified after they are stored.

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
- Order: (1) classifier writes to its own table and Respiro reads deployment types from it (done, migration 010); (2) add the latest table with its backfill; (3) switch Respiro's latest-reading queries to it.
- Each step works on its own and can be released separately.
