# Accessing Data

All WeSense data is free and open — published under [CC-BY-4.0](../architecture/data-licensing.md) by default, and signed end-to-end so anyone can verify where each reading came from. This page explains the ways to get at it, from a quick visual browse through to pulling the full archive for your own research.

::: tip Which option is right for me?
- Just looking around → **[Live map](#live-map)**.
- Building a dashboard or bot → **[Live MQTT subscription](#live-mqtt-subscription)**.
- Research, historical analysis, long time series → **[Historical Parquet archives](#historical-parquet-archives)**.
- Complex ad-hoc queries, joining with your own data → **[Run a station and query locally](#run-a-station-and-query-locally)**.
:::

---

## Live map

The fastest way to look at data is [**map.wesense.earth**](https://map.wesense.earth). It streams live readings over MQTT under the hood and visualises sensor locations, current values, and short-term trends. Handy for operators checking their own sensors, and for anyone curious about local air quality.

No account needed.

---

## Live MQTT subscription

WeSense publishes decoded readings on a public MQTT topic tree. Every reading flows through `wesense/decoded/{source}/{country}/{subdivision}/{device_id}` as a JSON payload, and you can subscribe to whichever slice you care about.

**Public broker:** `mqtt.wesense.earth:8883` (TLS). Contact a hub operator for credentials, or run your own hub and subscribe locally — both work equally well.

### Topic examples

```bash
# Everything, firehose:
wesense/decoded/#

# Only WeSense-branded sensors:
wesense/decoded/wesense/#

# Everything from New Zealand:
wesense/decoded/+/nz/#

# Auckland only:
wesense/decoded/+/nz/auk/#

# One specific device:
wesense/decoded/+/nz/auk/office_301274c0e8fc
```

### Quick-start examples

**mosquitto_sub (CLI):**

```bash
mosquitto_sub -h mqtt.wesense.earth -p 8883 --capath /etc/ssl/certs \
  -u "your_user" -P "your_pass" \
  -t 'wesense/decoded/+/nz/#' -v
```

**Python (paho-mqtt):**

```python
import json
import paho.mqtt.client as mqtt

def on_message(client, userdata, msg):
    reading = json.loads(msg.payload)
    print(f"{reading['timestamp']} {reading['reading_type']}={reading['value']}{reading.get('unit','')}")

client = mqtt.Client()
client.username_pw_set("your_user", "your_pass")
client.tls_set()
client.on_message = on_message
client.connect("mqtt.wesense.earth", 8883, 60)
client.subscribe("wesense/decoded/+/nz/#")
client.loop_forever()
```

Payload shape — one reading per message, with full provenance:

```json
{
  "timestamp": "2026-04-18T03:17:00Z",
  "device_id": "office_301274c0e8fc",
  "reading_type": "co2",
  "reading_type_name": "CO2",
  "value": 850.0,
  "unit": "ppm",
  "latitude": -36.8485,
  "longitude": 174.7633,
  "geo_country": "nz",
  "geo_subdivision": "auk",
  "sensor_model": "SCD4X",
  "data_license": "CC-BY-4.0",
  "signature": "…",
  "public_key": "…"
}
```

Full payload documentation: [Data Schema Reference](../developers/data-schema.md) and [Topic Structure](../architecture/topic-structure.md).

::: info Why the source segment comes after `decoded/`
The `{source}` segment is the data's origin (WeSense ESP32s, Meshtastic nodes, Home Assistant bridges, government air-quality APIs, etc). Use it to filter to a specific source, or wildcard it with `+` if you want everything.
:::

---

## Historical Parquet archives

Every day, each guardian station exports its region's data to a Parquet archive and publishes the content-addressed identifier (CID) to the WeSense distributed registry. You download once and verify forever — the CID is the file's SHA-256, so you always know you've got the bytes the network produced.

### What's in the archive

- Same columns as the [ClickHouse schema](../developers/data-schema.md#key-columns) — timestamps, values, units, location, signatures.
- ZSTD-compressed Parquet, partitioned by `(country, subdivision, date)`.
- One row per reading (deduplicated across replicas by content-based `reading_id`).

File sizes are small: a single region's entire day of readings is typically a few MB to a few hundred MB depending on sensor density.

### Getting an archive

Archives live in IPFS. The CIDs are discoverable via the WeSense P2P registry — practical access is either through a WeSense station or via a public IPFS gateway.

**If you run a WeSense station** (see [Operate a Station](../station-operators/operate-a-station.md)), the Archive Replicator already fetches and pins archives for your configured `GUARDIAN_SCOPE`. Point your tools at the local IPFS node or the `./data/archives/` directory.

**Without a station**, use a public IPFS gateway. Once you have a CID (`bafybei…`), the file is reachable at:

```
https://ipfs.io/ipfs/<CID>
https://cloudflare-ipfs.com/ipfs/<CID>
https://dweb.link/ipfs/<CID>
```

Discovering CIDs without a station is currently awkward — there's no public HTTP index yet. The easiest path for pure consumers is either to run a station (it's lightweight — see [Deployment Profiles](../station-operators/deployment-profiles.md)), or ask a friendly station operator for the CID list for your region. A public index is on the roadmap.

### Reading Parquet

Any Parquet reader works. A few one-liners:

**DuckDB (zero-config, fast):**

```sql
-- Query a local or remote Parquet directly:
SELECT geo_country, reading_type, avg(value), count(*)
FROM 'nz-auk-2026-04-18.parquet'
GROUP BY 1, 2;
```

**Python (pandas + pyarrow):**

```python
import pandas as pd
df = pd.read_parquet('nz-auk-2026-04-18.parquet')
print(df.groupby(['reading_type'])['value'].describe())
```

**Python (polars, fast + low memory):**

```python
import polars as pl
df = pl.read_parquet('nz-auk-2026-04-18.parquet')
```

**ClickHouse local (no server, reads Parquet directly):**

```bash
clickhouse local --query "
  SELECT geo_subdivision, reading_type, avg(value)
  FROM file('nz-auk-2026-04-18.parquet', Parquet)
  GROUP BY 1, 2"
```

---

## Run a station and query locally

If you want ad-hoc SQL access, or you're joining WeSense data with your own datasets, the cleanest path is to run a `guardian` station. You get:

- A local ClickHouse replica of everything in your `GUARDIAN_SCOPE` (your region, your country, or the whole world).
- Archive Replicator pinning the historical Parquet archives.
- Live MQTT subscriber pulling fresh readings directly.

The minimum hardware is modest — see [Run a Bootstrap Node](../station-operators/run-a-bootstrap.md) for a reference VPS spec.

### Local ClickHouse

Once your station is running, ClickHouse listens on port 8123 (HTTP) on the local network:

```bash
clickhouse-client -h localhost -u wesense --password <your-password> \
  -q "SELECT count() FROM wesense.sensor_readings"
```

Or via HTTP:

```bash
curl -u wesense:<your-password> \
  'http://localhost:8123/?query=SELECT+count()+FROM+wesense.sensor_readings'
```

### Why there's no central query endpoint

WeSense is deliberately decentralised — no single organisation owns an API that everyone queries. Running your own replica is how you get full query freedom, and how the network stays resilient to any single participant vanishing. The trade-off is the modest setup step, and we think it's the right one for a 200-year archival system. See [Architecture Overview → Decentralization Principles](../architecture/index.md#decentralization-principles) for the fuller argument.

---

## Data license and citation

Default licence is **CC-BY-4.0**. Individual rows carry a `data_license` field, so if any data was contributed under a different licence you can identify it per reading. When publishing analysis or derivatives, attribute "WeSense community sensor network" and link back to [wesense.earth](https://wesense.earth).

Full terms: [Data Licensing](../architecture/data-licensing.md).

---

## Related references

- **[Data Schema Reference](../developers/data-schema.md)** — the shape of every reading, column by column
- **[Topic Structure](../architecture/topic-structure.md)** — MQTT / Zenoh / OrbitDB message formats
- **[Storage & Archives](../architecture/storage-and-archives.md)** — how archives are built and what's in them
- **[Data Integrity](../architecture/data-integrity.md)** — signing and verification so you can trust what you download
- **[Operate a Station](../station-operators/operate-a-station.md)** — setup guide if you want local access
