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

The planned fix for both is a small "latest per device" table maintained by ClickHouse (a materialised view), whose size depends on the number of sensors rather than the length of history.
