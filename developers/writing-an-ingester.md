# Writing a WeSense Ingester

An ingester is a small Python service that connects to a data source and feeds environmental readings into the WeSense network. You write the part that talks to your data source — the shared `wesense-ingester-core` library handles everything else: geocoding, deduplication, signing, storage, and distribution.

## What an Ingester Does

Every ingester follows three steps:

1. **Connect** to a data source — MQTT subscription, HTTP webhook, REST API poll, WebSocket, serial port, or anything else that produces sensor data.
2. **Decode** the source-specific payload into a standard Python dictionary — one dict per reading (e.g., one temperature value from one device at one point in time).
3. **Hand off to core** — the shared library geocodes coordinates into ISO 3166 country/subdivision codes, deduplicates readings, signs them with Ed25519, posts them to the storage broker (which writes to ClickHouse and archives to the distributed network), and publishes to MQTT for real-time map updates.

```
Your data source
      │
      ▼
┌─────────────┐
│  Your code  │  Connect + decode (the only part you write)
└──────┬──────┘
       │  standard reading dict
       ▼
┌─────────────────────────────────┐
│     wesense-ingester-core       │  Shared library (you call its API)
│                                 │
│  Deduplication ──→ Geocoding    │
│       │                │        │
│       ▼                ▼        │
│  Ed25519 Signing                │
│       │                         │
│       ├──→ Storage Broker       │  Writes to ClickHouse, archives to P2P network
│       └──→ MQTT Publish         │  Real-time feed for maps and remote stations
└─────────────────────────────────┘
```

Your ingester never talks to ClickHouse, never builds Parquet files, never touches the P2P network. Those are all handled by the services behind the storage broker. This means a new ingester is typically a single Python file plus an adapter module for your data source.

## What the Data Needs

WeSense is a geographic sensor network — the relationship between a location and a reading is foundational. Without both, the system can't function: readings can't be placed on the map, assigned to a region, archived by subdivision, or replicated to stations that subscribe by area. A location and a reading are the two non-negotiable inputs to every ingester.

Beyond that, the pipeline needs a few more fields to operate correctly:

| Requirement                           | Why                                                                                                                                                                 | Example                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **A location** (latitude + longitude) | The foundation — every map tile, choropleth overlay, regional archive, and P2P subscription is geographic.                                                          | `-36.848, 174.763`           |
| **A value and its type**              | What was measured and what the number means.                                                                                                                        | `"pm2_5"`, `12.3`, `"µg/m³"` |
| **A device identity**                 | Tracks accuracy over time, detects sensor drift, and deduplicates readings that arrive via multiple paths.                                                          | `"mydata_station_42"`        |
| **A timestamp**                       | When the sensor took the measurement — not when the ingester received it. Content-based deduplication depends on this being consistent regardless of delivery path. | `1712000000` (Unix epoch)    |

The geocoder in `wesense-ingester-core` converts lat/lon into ISO 3166 country and subdivision codes automatically — you don't do this yourself, but the storage broker rejects readings without them.

Richer metadata (deployment type, sensor model, calibration status, station name) makes the data more valuable, but a reading with just the four fields above is enough to get started.

## Existing Ingesters

These are the current ingesters, ordered by complexity:

| Ingester                         | Data Source                     | Complexity | Why                                                                        |
| -------------------------------- | ------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `wesense-ingester-govaq-nz`      | NZ government REST APIs         | Simple     | Polls HTTP APIs, parses JSON/XML, no protobuf                              |
| `wesense-ingester-govaq-au`      | Australian government APIs      | Simple     | Same pattern as govaq-nz — 6 state/territory adapters                      |
| `wesense-ingester-homeassistant` | Home Assistant REST + WebSocket | Simple     | JSON payloads, but has loop-prevention logic                               |
| `wesense-ingester-wesense`       | MQTT + TTN HTTP webhook         | Medium     | WeSense protobuf v2 decoding, LoRa metadata cache                          |
| `wesense-ingester-meshtastic`    | MQTT (mqtt.meshtastic.org)      | Medium     | Protobuf + AES decryption, position-telemetry correlation with 7-day cache |

If you're writing a new ingester, start by reading `wesense-ingester-govaq-nz` — it's the simplest real example and was built on the core library from day one.

## Getting Involved

Writing an ingester is one of the most valuable contributions to WeSense — every new data source makes the network richer. Here's how the process works:

### Starting Out

You don't need to be a WeSense project member to start building. Develop locally against the core library, get your ingester working, and open a discussion or issue on the `wesense` repo when you're ready to talk about integrating it.

If the data source is a good fit for the network, we'll create a repository for you under the `wesense-earth` organisation and add you as a maintainer. For data sources you have particular expertise in, we'd welcome you as an ongoing maintainer — you know the quirks of the API, the data quality issues, and when the upstream format changes. The project benefits most when the person who understands the data source is the one looking after the ingester.

If you'd prefer to keep the repo under your own account, that works too — community-operated ingesters can publish their own Docker images and be added to the docker-compose profiles as an external image.

### What Makes a Good Ingester Candidate

Any environmental data source with geographic coordinates is a potential fit:

- Government air quality networks (like our `wesense-ingester-govaq-nz`)
- Weather station networks (Ecowitt, Davis, WeatherFlow)
- Community sensor networks (PurpleAir, Sensor.Community, OpenAQ)
- IoT platforms with environmental sensors
- Research station datasets

The data doesn't need to be real-time — polling an API every 10 minutes or even importing historical datasets are both valid patterns.

## Quick Start

### 1. Repository Setup

Create a new repository (or directory) for your ingester:

```
wesense-ingester-mydata/
├── mydata_ingester.py          # Main ingester (connect + decode + pipeline)
├── adapters/                   # Optional: source-specific decoder modules
│   └── my_api.py
├── requirements.txt            # Local dev: -e ../wesense-ingester-core + your deps
├── requirements-docker.txt     # Docker: just your deps (core installed separately)
├── Dockerfile
├── .github/
│   └── workflows/
│       └── docker-build.yml    # CI/CD — see "Automated Builds" section below
└── config/                     # Optional: source configs, station lists, etc.
```

### 2. Dependencies

For local development, your `requirements.txt` points to the core library:

```
-e ../wesense-ingester-core
requests>=2.31.0
# ... your source-specific dependencies
```

For Docker, the Dockerfile installs core separately (see [Dockerfile Pattern](#dockerfile-pattern) below).

### 3. The Ingester

Here is the complete structure of a minimal ingester. This is a real, working pattern — the annotations show where you'd plug in your own data source.

```python
#!/usr/bin/env python3
"""
WeSense Ingester — My Data Source

Describe what this ingester does, what it connects to,
and any source-specific quirks.
"""

import os

from wesense_ingester import ReadingPipeline, Shutdown, setup_logging

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "300"))  # seconds


class MyDataIngester:

    def __init__(self):
        self.logger = setup_logging("mydata")

        # The pipeline handles everything after the reading leaves your code:
        # dedup, geocoding, canonical reading construction, Ed25519 signing,
        # MQTT publishing, storage broker POST, AND OrbitDB trust registry.
        # MQTT config is read from env vars automatically — WESENSE_OUTPUT_*
        # or MQTT_* fallback.
        self.pipeline = ReadingPipeline(name="mydata")

        # ── Your data source setup ──────────────────────────────
        # Initialise your API client, MQTT subscriber, webhook
        # server, or whatever connects to your data source.
        # ...

    # ── The only code you write per reading ─────────────────────
    # Build a flat dict with the reading's fields and hand it to the
    # pipeline. The pipeline dedups, geocodes (if you didn't), builds
    # the canonical reading, signs it, publishes to MQTT, and POSTs
    # to the storage broker — all atomically.

    def on_reading(
        self,
        device_id: str,
        reading_type: str,
        value: float,
        unit: str,
        timestamp: int,
        lat: float,
        lon: float,
        station_name: str = "",
    ) -> None:
        """Hand a reading to the WeSense pipeline."""
        self.pipeline.process({
            "device_id": device_id,
            "timestamp": timestamp,                # Unix epoch seconds from sensor
            "reading_type": reading_type,          # e.g. "temperature", "pm2_5"
            "value": value,                        # See "Determinism" section below
            "unit": unit,                          # e.g. "°C", "µg/m³"
            "latitude": lat,
            "longitude": lon,
            "data_source": "mydata",               # ← your data source ID
            "data_source_name": "My Data",         # ← human-readable display name
            "sensor_transport": "",                # first-hop (wifi, lora, lorawan, or "")
            "deployment_type": "OUTDOOR",          # or INDOOR, MIXED, or ""
            "deployment_type_source": "manual",
            "location_source": "manual",           # or gps, network
            "node_name": station_name,
            "data_license": "CC-BY-4.0",           # or a source-specific license
            "network_source": "api",               # operational metadata (not signed)
        })

    # ── Your data source loop ──────────────────────────────────
    # This is where YOUR code goes. Fetch data however your
    # source provides it, decode it, and call on_reading()
    # for each reading.

    def poll(self) -> None:
        """Fetch readings from your data source."""
        # Example: polling a REST API
        #
        # stations = my_api.get_stations()
        # for station in stations:
        #     readings = my_api.get_readings(station["id"])
        #     for r in readings:
        #         self.on_reading(
        #             device_id=f"mydata_{station['id']}",
        #             reading_type=r["type"],    # e.g. "temperature"
        #             value=r["value"],           # e.g. 22.5
        #             unit=r["unit"],             # e.g. "°C"
        #             timestamp=r["timestamp"],   # Unix epoch (int)
        #             lat=station["lat"],
        #             lon=station["lon"],
        #             station_name=station["name"],
        #         )
        pass

    # ── Lifecycle ──────────────────────────────────────────────
    # Shutdown installs SIGINT/SIGTERM handlers automatically.
    # Use shutdown.sleep() instead of time.sleep() so the loop
    # exits promptly when the container stops.

    def run(self) -> None:
        shutdown = Shutdown(name="mydata")
        self.logger.info("Starting (poll interval: %ds)", POLL_INTERVAL)

        while not shutdown.requested:
            try:
                self.poll()
            except Exception as e:
                self.logger.error("Poll failed: %s", e, exc_info=True)
            shutdown.sleep(POLL_INTERVAL)

        self.pipeline.close()
        self.logger.info("Shutdown complete.")


def main():
    ingester = MyDataIngester()
    ingester.run()


if __name__ == "__main__":
    main()
```

This is the entire ingester. Roughly 80 lines in total, of which maybe 15 are yours — the rest is boilerplate that makes the structure clear. For a polling data source like a REST API, you only need to write `poll()` and fill in the reading dict. Everything else is provided by the core library.

### 4. What You Write vs What Core Provides

| Responsibility                      | Who                   | Notes                                                                                        |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| Connect to data source              | **You**               | MQTT subscribe, HTTP poll, webhook server, etc.                                              |
| Decode raw payload                  | **You**               | JSON, XML, protobuf, CSV — whatever your source sends                                        |
| Preprocess values                   | **You**               | Any precision-altering arithmetic (rounding, unit conversion). See "Determinism" below.      |
| Map fields to standard reading dict | **You**               | `reading_type`, `value`, `unit`, `device_id`, coordinates                                    |
| Deduplication                       | Core (pipeline)       | In-memory cache keyed on `(device_id, reading_type, timestamp)`                              |
| Reverse geocoding                   | Core (pipeline)       | Offline GeoNames, lat/lon → ISO 3166 codes                                                   |
| Build canonical reading             | Core (pipeline)       | Enforces types, applies defaults, produces the exact bytes that get signed                   |
| Ed25519 signing                     | Core (pipeline)       | Auto-generated keys, signs the canonical bytes, includes `signing_payload_version` in payload |
| MQTT publish                        | Core (pipeline)       | Same signed payload sent to MQTT for P2P distribution                                        |
| Storage broker POST                 | Core (pipeline)       | Same signed payload POSTed to storage broker                                                 |
| OrbitDB trust registration          | Core (pipeline)       | Registers the ingester's public key and runs trust sync (disable with `enable_orbitdb_registry=False`) |
| Signal handling (SIGINT/SIGTERM)    | Core (Shutdown)       | `Shutdown` class installs handlers, provides `requested` flag and `sleep()` helper           |
| MQTT config from env                | Core                  | `WESENSE_OUTPUT_*` with fallback to `MQTT_*` — no explicit config construction needed        |
| P2P distribution                    | Live Transport        | Subscribes to MQTT decoded topics, forwards to Zenoh (preserves original signature)          |
| Archiving to Parquet                | Storage Broker        | Archives ClickHouse data to the distributed blob store on schedule                           |

The critical design property: **the canonical reading is built once and signed once, and the identical signed payload is sent to both MQTT and the storage broker.** You never need to construct three separate dicts, and the pipeline prevents you from doing so accidentally. This guarantees that a reading archived by the originating station and a reading archived by a remote station (that received it via live P2P) produce byte-identical Parquet rows. See [Data Integrity](/architecture/data-integrity) for the full Dual-Path Identity Invariant specification.

### 5. The Standard Reading Dict

Every reading you produce must include these fields:

| Field                | Type  | Required    | Description                                                                       |
| -------------------- | ----- | ----------- | --------------------------------------------------------------------------------- |
| `device_id`          | str   | Yes         | Unique device identifier (prefix with your source name, e.g. `mydata_station123`) |
| `timestamp`          | int   | Yes         | Unix epoch seconds — **from the sensor**, not from when you received it           |
| `reading_type`       | str   | Yes         | Standardised type (see table below)                                               |
| `value`              | float | Yes         | The measurement value                                                             |
| `unit`               | str   | Yes         | Unit string (e.g. `°C`, `%`, `µg/m³`)                                             |
| `latitude`           | float | Yes         | Decimal degrees                                                                   |
| `longitude`          | float | Yes         | Decimal degrees                                                                   |
| `data_source`        | str   | Yes         | Your data source identifier, lowercase (e.g. `mydata`)                            |
| `data_source_name`   | str   | Yes         | Human-readable name (e.g. `My Data Network`)                                      |
| `node_name`          | str   | Recommended | Human-readable station/device name                                                |
| `deployment_type`    | str   | Recommended | `OUTDOOR`, `INDOOR`, `MIXED`, or empty if unknown                                 |
| `altitude`           | float | Optional    | Metres above sea level, or `None`                                                 |
| `board_model`        | str   | Optional    | Hardware model, or empty                                                          |
| `sensor_model`       | str   | Optional    | Sensor IC model (e.g. `BMP280`), or empty                                         |
| `calibration_status` | str   | Optional    | `calibrated`, `factory`, or empty                                                 |
| `sensor_transport`   | str   | Optional    | Sensor's first-hop connection (`wifi`, `lora`, `lorawan`), or empty               |
| `location_source`    | str   | Optional    | How coordinates were obtained (`gps`, `manual`, `network`)                        |
| `data_license`       | str   | Recommended | Licence under which the data is published (e.g. `CC-BY-4.0`, `OGL-3.0`)          |

**Standard reading types:**

| `reading_type`   | `unit` | Description                   |
| ---------------- | ------ | ----------------------------- |
| `temperature`    | °C     | Air temperature               |
| `humidity`       | %      | Relative humidity             |
| `pressure`       | hPa    | Barometric pressure           |
| `co2`            | ppm    | Carbon dioxide                |
| `pm1_0`          | µg/m³  | Particulate matter ≤1.0µm     |
| `pm2_5`          | µg/m³  | Particulate matter ≤2.5µm     |
| `pm10`           | µg/m³  | Particulate matter ≤10µm      |
| `voc_index`      | index  | VOC air quality index (1-500) |
| `nox_index`      | index  | NOx air quality index (1-500) |
| `wind_speed`     | m/s    | Wind speed                    |
| `wind_direction` | °      | Wind direction (0-360)        |
| `rainfall`       | mm     | Rainfall accumulation         |
| `no2`            | µg/m³  | Nitrogen dioxide              |
| `so2`            | µg/m³  | Sulphur dioxide               |

See the [Data Schema Reference](/developers/data-schema) for the full table including particle bin counts, raw sensor values, and other types.

## Determinism — Why This Matters

WeSense stores readings in content-addressed archives. Two stations that both receive the same reading must produce byte-identical Parquet blobs, or the network stores the same data twice under different hashes. At a million nodes this would be catastrophic — it's the single invariant that must not break.

The pipeline handles most of this for you. But there are a few rules you must follow when writing an ingester.

### The Rules for Ingester Authors

**1. Don't modify values inside the reading dict "just before" calling `pipeline.process()`.**

If you round, truncate, or unit-convert a value, do it at the point where you decode the raw sensor data — then pass the result to the pipeline unchanged. Two ingesters handling the same sensor must apply identical preprocessing. The pipeline does not normalise numeric values; whatever you pass is what gets signed.

**2. If you round, document and publish the rounding rules.**

The WeSense LoRa ingester rounds sensor values to a fixed number of decimal places (temperature to 2dp, PM2.5 to 1dp, CO₂ to integer, etc.) because LoRaWAN bandwidth is limited and higher precision isn't meaningful. The rules live in a `READING_DECIMALS` table in that ingester. Any other implementation of the same sensor decoder — including ports to other languages — must apply the same rounding. Python's `round()` uses banker's rounding (round half to even); if you port to Rust or Go, use the same semantics.

**3. Don't duplicate an existing ingester in a different language unless you can prove byte-identical output.**

If a Python ingester for the `WeSense-compatible sensor X` already exists, and you write a Rust ingester for the same sensor type, both ingesters processing the same physical reading MUST produce byte-identical canonical bytes. Otherwise their archives diverge and the invariant breaks. Write a regression test that feeds known sensor inputs through both implementations and compares the output of `canonical_to_json()`.

**4. You CAN add an ingester for a new sensor type in any language.**

If no other ingester handles the sensor type, there's no collision risk. Your canonical bytes are the only ones that exist for that data. Just follow the general contract:

- `timestamp` is always int Unix seconds from the sensor
- String fields are always strings (empty string `""` for absent, never `null`)
- `latitude`, `longitude`, `altitude` are floats or `null`, never strings
- `value` is always a float, never null

**5. The pipeline signs what you pass.**

The signature covers every field in the canonical reading. If you later discover a bug where an ingester was passing the wrong value for a field, you cannot retroactively fix the signature — the signed payload is what it is. Fix the bug, deploy, and new readings will be correct. Old readings stay as they are (content-addressed immutability).

### Why We Don't Just Normalise in the Pipeline

Normalising numbers in the pipeline (e.g., forcing a global rounding rule) would solve the determinism problem at the cost of losing information. A temperature sensor accurate to 3 decimal places would be silently truncated. Instead, the pipeline trusts the ingester to preprocess appropriately, and the determinism contract keeps the system honest.

For the full formal contract (JSON serialisation rules, cross-language requirements, frozen canonical schema versions), see [Data Integrity](/architecture/data-integrity) §"Canonical Determinism Contract".

## Connection Patterns

Different data sources need different connection approaches. Here are the common patterns used by existing ingesters:

### REST API Polling

Poll an HTTP API on a timer. Simplest pattern — used by `wesense-ingester-govaq-nz`.

```python
def poll(self):
    response = requests.get("https://api.example.com/readings")
    for item in response.json():
        self.process_reading(
            device_id=f"mydata_{item['station_id']}",
            reading_type=item["parameter"],
            value=item["value"],
            unit=item["unit"],
            timestamp=int(item["epoch"]),
            lat=item["lat"],
            lon=item["lon"],
        )
```

### MQTT Subscription

Subscribe to an MQTT broker and process messages as they arrive. Used by `wesense-ingester-wesense` and `wesense-ingester-meshtastic`.

```python
import paho.mqtt.client as mqtt

def __init__(self):
    # ... core setup as above ...

    # MQTT subscriber (separate from the core MQTT publisher)
    self.source_client = mqtt.Client(client_id="mydata_subscriber")
    self.source_client.on_message = self._on_message
    self.source_client.connect("mqtt.datasource.example")
    self.source_client.subscribe("datasource/readings/#")
    self.source_client.loop_start()

def _on_message(self, client, userdata, msg):
    data = json.loads(msg.payload)
    self.process_reading(
        device_id=data["device"],
        reading_type=data["type"],
        value=data["value"],
        # ...
    )
```

### HTTP Webhook Receiver

Run a small HTTP server that receives POST callbacks. Used by `wesense-ingester-wesense` for TTN LoRaWAN webhooks.

```python
from flask import Flask, request
import threading

def __init__(self):
    # ... core setup as above ...

    # Webhook server in background thread
    self.app = Flask(__name__)
    self.app.add_url_rule("/webhook", view_func=self._webhook, methods=["POST"])
    thread = threading.Thread(
        target=self.app.run,
        kwargs={"host": "0.0.0.0", "port": 8090},
        daemon=True,
    )
    thread.start()

def _webhook(self):
    data = request.json
    self.process_reading(
        device_id=data["device_id"],
        # ...
    )
    return "", 204
```

## Adapters

If your ingester talks to multiple sources with different APIs (like `wesense-ingester-govaq-nz` which talks to ECan and 7 Hilltop councils), split the source-specific logic into adapter modules:

```python
# adapters/base.py
from abc import ABC, abstractmethod

class MyAdapter(ABC):
    def __init__(self, source_id: str, config: dict):
        self.source_id = source_id
        self.config = config

    @abstractmethod
    def fetch_stations(self) -> list[dict]:
        """Return dicts with: station_id, name, latitude, longitude"""

    @abstractmethod
    def fetch_readings(self, station: dict) -> list[dict]:
        """Return dicts with: timestamp, reading_type, value, unit"""
```

```python
# adapters/my_api.py
class MyAPIAdapter(MyAdapter):
    def fetch_stations(self):
        resp = requests.get(f"{self.config['base_url']}/stations")
        return [
            {"station_id": s["id"], "name": s["name"],
             "latitude": s["lat"], "longitude": s["lon"]}
            for s in resp.json()
        ]

    def fetch_readings(self, station):
        resp = requests.get(f"{self.config['base_url']}/data/{station['station_id']}")
        return [
            {"timestamp": int(r["time"]), "reading_type": r["param"],
             "value": r["val"], "unit": r["unit"]}
            for r in resp.json()
        ]
```

The main ingester just loops over adapters and calls `process_reading()` for each result. This keeps the pipeline logic in one place and the source-specific parsing in its own module.

## Dockerfile Pattern

Ingester Dockerfiles use the parent directory as build context so they can copy `wesense-ingester-core`:

```dockerfile
FROM python:3.11-slim

# setpriv for privilege drop in entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends \
    util-linux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install the shared core library
COPY wesense-ingester-core/ /tmp/wesense-ingester-core/
RUN pip install --no-cache-dir /tmp/wesense-ingester-core/ && \
    rm -rf /tmp/wesense-ingester-core

# Install your ingester's dependencies
COPY wesense-ingester-mydata/requirements-docker.txt .
RUN pip install --no-cache-dir -r requirements-docker.txt

# Copy your ingester code
COPY wesense-ingester-mydata/mydata_ingester.py .
COPY wesense-ingester-mydata/adapters/ ./adapters/
COPY wesense-ingester-mydata/config/ ./config/
COPY wesense-ingester-mydata/entrypoint.sh .

RUN mkdir -p /app/cache /app/logs /app/data/keys /app/config

ENV TZ=UTC
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["/app/entrypoint.sh"]
```

**Important:** `python:3.11-slim` strips system timezone data. If your adapters use `ZoneInfo()` (e.g. for timezone-aware timestamp parsing), add `tzdata` to `requirements-docker.txt`:

```
requests>=2.31.0
tzdata
```

### Entrypoint Pattern

All ingesters use a privilege-dropping entrypoint that creates runtime directories, fixes ownership, then drops from root to the configured `PUID:PGID`:

```bash
#!/bin/bash
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

mkdir -p /app/cache /app/logs /app/data/keys
chown -R "$PUID:$PGID" /app/cache /app/logs /app/data

exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups \
    python -u govaq_ingester.py "$@"
```

Build from the parent directory:

```bash
docker build -f wesense-ingester-mydata/Dockerfile -t wesense-ingester-mydata .
```

## Environment Variables

All core components read configuration from environment variables. These are the ones your ingester inherits automatically:

| Variable          | Used By          | Default     | Description                                            |
| ----------------- | ---------------- | ----------- | ------------------------------------------------------ |
| `GATEWAY_URL`     | GatewayClient    | —           | Storage broker URL (e.g. `http://storage-broker:8080`) |
| `MQTT_BROKER`     | WeSensePublisher | `localhost` | MQTT broker for decoded output                         |
| `MQTT_PORT`       | WeSensePublisher | `1883`      | MQTT broker port                                       |
| `MQTT_USERNAME`   | WeSensePublisher | —           | MQTT credentials                                       |
| `MQTT_PASSWORD`   | WeSensePublisher | —           | MQTT credentials                                       |
| `MQTT_USE_TLS`    | WeSensePublisher | `false`     | Enable MQTTS                                           |
| `TLS_CA_CERTFILE` | WeSensePublisher | —           | CA cert for MQTT TLS                                   |
| `LOG_LEVEL`       | setup_logging    | `INFO`      | Logging verbosity                                      |

You define your own env vars for source-specific config (API URLs, poll intervals, etc.).

## Testing Locally

1. **Install dependencies:**

   ```bash
   cd wesense-ingester-mydata
   pip install -e ../wesense-ingester-core
   pip install -r requirements.txt
   ```

2. **Run with a local storage broker and MQTT:**

   ```bash
   export GATEWAY_URL=http://localhost:8080
   export MQTT_BROKER=localhost
   python mydata_ingester.py
   ```

3. **Or run MQTT-only** (no storage broker needed for initial testing):

   ```bash
   export MQTT_BROKER=localhost
   python mydata_ingester.py
   ```

   Subscribe to see your output:

   ```bash
   mosquitto_sub -t 'wesense/decoded/#' -v
   ```

4. **Verify readings appear** with the expected fields — especially `geo_country`, `geo_subdivision`, `reading_type`, `value`, and `unit`.

## Deployment

### Running Your Ingester

If you're writing an ingester, you'll most likely be the one running it — at least initially. An ingester runs as part of a WeSense station, so you'll need the station profile and its dependencies (EMQX, ClickHouse, storage broker, etc.). See [Operating a Station](/station-operators/operate-a-station) for the full setup guide, including disk space and resource requirements.

Your ingester gets its own Docker Compose profile so that it's opt-in — not everyone running a station will want every ingester. To run it alongside the standard station services:

```bash
docker compose --profile station --profile ingester-mydata up -d
```

### Adding to Docker Compose

Add your ingester to `wesense/docker-compose.yml` with its own profile name:

```yaml
ingester-mydata:
  image: ghcr.io/wesense-earth/wesense-ingester-mydata:latest
  container_name: wesense-ingester-mydata
  profiles: ["mydata"]
  depends_on:
    config-check:
      condition: service_completed_successfully
    storage-broker:
      condition: service_healthy
    emqx:
      condition: service_healthy
      required: false
  volumes:
    - ./ingester-mydata/config:/app/config:ro
    - ${DATA_DIR:-./data}/ingester-mydata/cache:/app/cache
    - ${DATA_DIR:-./data}/ingester-mydata/logs:/app/logs
    - ${DATA_DIR:-./data}/ingester-mydata/keys:/app/data/keys
    - ${DATA_DIR:-./data}/certs:/app/certs:ro
  environment:
    - PUID=${PUID:-1000}
    - PGID=${PGID:-1000}
    - GATEWAY_URL=http://storage-broker:8080
    - WESENSE_OUTPUT_BROKER=${MQTT_HOST:-emqx}
    - WESENSE_OUTPUT_PORT=${MQTT_PORT:-1883}
    - WESENSE_OUTPUT_USERNAME=${MQTT_USER}
    - WESENSE_OUTPUT_PASSWORD=${MQTT_PASSWORD}
    - POLL_INTERVAL=${MYDATA_POLL_INTERVAL:-300}
    # OrbitDB (host-network, reached via host-gateway)
    - ORBITDB_URL=${ORBITDB_URL:-http://wesense-orbitdb:5200}
    - LOG_LEVEL=${LOG_LEVEL:-INFO}
    - TLS_ENABLED=${TLS_ENABLED:-false}
    - TLS_CA_CERTFILE=/app/certs/ca.pem
  extra_hosts:
    - "wesense-orbitdb:host-gateway"
  restart: always
  networks:
    - wesense-net
```

**OrbitDB host-gateway:** OrbitDB runs with `network_mode: host` (required for libp2p peer discovery via mDNS and DHT). This means it's not on the Docker bridge network, so other containers can't resolve `wesense-orbitdb` via Docker DNS. The `extra_hosts` directive maps the hostname to the host machine's gateway IP, allowing the ingester to reach OrbitDB's HTTP API on port 5200. Without this, the pipeline's OrbitDB trust registration will fail with `Name or service not known`.

### Default Config in the Deployment Repo

The config volume mount (`./ingester-mydata/config:/app/config:ro`) means the config must exist on the host filesystem. This is by design — operators can edit the config without rebuilding the image. But it means the default config must ship with the `wesense` deployment repo so it's there when someone clones and runs for the first time.

Create the default config in the deployment repo:

```
wesense/
├── ingester-mydata/
│   └── config/
│       └── sources.json    # Default config, checked into the wesense repo
```

This file is what gets bind-mounted into the container. The image also contains a copy (from the Dockerfile `COPY`), but the bind mount takes precedence. If the host directory is missing, the container will fail — which is why the default must ship in the deployment repo.

## Automated Builds (CI/CD)

All WeSense ingesters use the same GitHub Actions workflow to build multi-platform Docker images and publish them to `ghcr.io`. You don't need to write this from scratch — copy it from any existing ingester and change the repo name.

The workflow does three things:

1. **Builds** your Docker image for both `linux/amd64` and `linux/arm64` (native builds, not cross-compilation)
2. **Publishes** a multi-arch manifest to `ghcr.io/wesense-earth/wesense-ingester-mydata`
3. **Cleans up** old image versions automatically

Here's the workflow file — save it as `.github/workflows/docker-build.yml`:

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main, dev]
    tags: ['v*']
  pull_request:
    branches: [main, dev]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    strategy:
      matrix:
        include:
          - platform: linux/amd64
            runner: ubuntu-latest
          - platform: linux/arm64
            runner: ubuntu-24.04-arm
    runs-on: ${{ matrix.runner }}
    permissions:
      contents: read
      packages: write

    steps:
      - name: Determine branch
        id: core-branch
        run: echo "ref=${{ github.ref_name }}" >> "$GITHUB_OUTPUT"

      # Check out your ingester repo
      - name: Checkout ingester
        uses: actions/checkout@v4
        with:
          ref: ${{ steps.core-branch.outputs.ref }}
          path: wesense-ingester-mydata          # ← change this

      # Check out the core library (tries matching branch, falls back to main)
      - name: Checkout core library (matching branch)
        id: checkout-core
        uses: actions/checkout@v4
        with:
          repository: wesense-earth/wesense-ingester-core
          token: ${{ secrets.CORE_REPO_TOKEN }}
          ref: ${{ steps.core-branch.outputs.ref }}
          path: wesense-ingester-core
        continue-on-error: true

      - name: Fallback to core main branch
        if: steps.checkout-core.outcome == 'failure'
        uses: actions/checkout@v4
        with:
          repository: wesense-earth/wesense-ingester-core
          token: ${{ secrets.CORE_REPO_TOKEN }}
          ref: main
          path: wesense-ingester-core

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}

      - name: Platform slug
        id: slug
        run: echo "slug=$(echo '${{ matrix.platform }}' | tr '/' '-')" >> "$GITHUB_OUTPUT"

      - name: Build and push by digest
        id: build
        uses: docker/build-push-action@v6
        with:
          context: .
          file: wesense-ingester-mydata/Dockerfile   # ← change this
          platforms: ${{ matrix.platform }}
          build-args: |
            CACHE_BUST=${{ github.sha }}
          labels: ${{ steps.meta.outputs.labels }}
          outputs: type=image,name=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }},push-by-digest=true,name-canonical=true,push=${{ github.event_name != 'pull_request' }}
          no-cache: true

      - name: Export digest
        if: github.event_name != 'pull_request'
        run: |
          mkdir -p /tmp/digests
          digest="${{ steps.build.outputs.digest }}"
          touch "/tmp/digests/${digest#sha256:}"

      - name: Upload digest
        if: github.event_name != 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: digests-${{ steps.slug.outputs.slug }}
          path: /tmp/digests/*
          if-no-files-found: error
          retention-days: 1

  merge:
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    needs: build
    permissions:
      contents: read
      packages: write

    steps:
      - name: Download digests
        uses: actions/download-artifact@v4
        with:
          path: /tmp/digests
          pattern: digests-*
          merge-multiple: true

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Create manifest list and push
        working-directory: /tmp/digests
        run: |
          docker buildx imagetools create \
            $(jq -cr '.tags | map("-t " + .) | join(" ")' <<< "$DOCKER_METADATA_OUTPUT_JSON") \
            $(printf '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@sha256:%s ' *)

  cleanup:
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    needs: merge
    permissions:
      packages: write

    steps:
      - name: Clean up old package versions
        uses: snok/container-retention-policy@v3.0.1
        with:
          account: ${{ github.repository_owner }}
          token: ${{ secrets.GITHUB_TOKEN }}
          image-names: ${{ github.event.repository.name }}
          cut-off: 7d
          keep-n-most-recent: 3
          tag-selection: both
```

**What you need to change:** Just the two lines marked `← change this` — your repo directory name and Dockerfile path.

**What happens automatically:**

- Push to `main` → builds and publishes as `:latest` and `:main`
- Push to `dev` → publishes as `:dev`
- Tag `v1.2.3` → publishes as `:1.2.3`, `:1.2`, and `:latest`
- Pull requests → builds but doesn't publish (validation only)
- When `wesense-ingester-core` is updated, it triggers a rebuild of all registered ingesters automatically

**Repo secret needed:** `CORE_REPO_TOKEN` — a GitHub personal access token with read access to `wesense-ingester-core`. If your repo is under the `wesense-earth` organisation, this is already configured.

Don't worry if CI/CD isn't your area — if you get the ingester working and submit the code, we can set up the build pipeline for you.

## First Deployment Checklist

After your ingester is built, tested, and has a Docker image on GHCR, there are several steps to get it running in production:

### Repository and CI

1. **Push both `main` and `dev` branches.** CI builds image tags from branch names. If your deployment pulls the `:dev` tag, a `dev` branch must exist or the image won't be found.
2. **Set GHCR package visibility to public.** GitHub Container Registry packages default to private even when the repo is public. After the first CI build, go to GitHub → Packages → your package → Settings → Change visibility to Public.

### Docker Compose

3. **Add service to `wesense/docker-compose.yml`.** Follow the pattern in [Adding to Docker Compose](#adding-to-docker-compose) above — including the `extra_hosts` for OrbitDB.
4. **Add default config to the `wesense` deployment repo.** Create `wesense/ingester-mydata/config/` with your default config file. This gets bind-mounted into the container.
5. **Add profile to `.env.sample`.** Document the new profile name in the "Data source profiles" comment block and add an image override line.

### Respiro (Map)

6. **Verify data appears on the map.** Respiro auto-discovers new `data_source` values from ClickHouse. No code change needed.
7. **Add freshness threshold.** Add your source to `FRESHNESS_THRESHOLDS` in `wesense-respiro/src/index.js`. Set it slightly longer than the expected reporting interval (e.g. 60 minutes for a source that publishes hourly data polled every 15 minutes). Without this, sensors show as stale between polls.
8. **Set `data_source_name`.** Ensure your ingester sets a human-readable `data_source_name` on every reading, as Respiro displays this in the UI.

### Performance

9. **Tune API timeouts.** If your source makes one HTTP call per station (as opposed to a bulk feed), use a short timeout (10s) so slow stations don't block the entire poll cycle. Log progress every N stations so operators can see the ingester is working.
10. **Log progress for slow sources.** An ingester that polls 100+ stations with no intermediate logging appears hung. Log every 10 stations or every 30 seconds.

## Maintenance

Once your ingester is running in the WeSense network:

- **You're the expert** on your data source. If the upstream API changes format, adds rate limits, or introduces new sensor types, you're best placed to update the ingester. We'll flag issues we notice (e.g. readings stopping) but may not know the fix.
- **Core library updates are automatic.** When `wesense-ingester-core` is updated (new features, bug fixes, security patches), GitHub Actions rebuilds all ingester images. Your ingester benefits from improvements to geocoding, deduplication, signing, and storage without any changes on your part.
- **Breaking changes are rare and communicated.** The core library's API is stable. If a breaking change is needed, we'll coordinate with maintainers and provide migration guidance.

## Summary

Writing a WeSense ingester means writing a decoder for your data source. The shared library and backend services handle:

- **Deduplication** — so duplicate readings from different paths don't pollute the database
- **Geocoding** — so every reading has standardised ISO 3166 location codes
- **Signing** — so every reading is cryptographically traceable to the ingester that produced it
- **Storage** — so readings are written to ClickHouse and archived to the distributed network
- **Distribution** — so readings appear on real-time maps and replicate to remote stations

You don't need to understand ClickHouse, Parquet, Zenoh, or the P2P network to write an ingester. You just need to know how to talk to your data source.
