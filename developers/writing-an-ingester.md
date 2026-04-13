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

import json
import os
import signal
import socket
import time

from wesense_ingester import (
    DeduplicationCache,
    ReverseGeocoder,
    setup_logging,
)
from wesense_ingester.gateway.client import GatewayClient
from wesense_ingester.gateway.config import GatewayConfig
from wesense_ingester.mqtt.publisher import MQTTPublisherConfig, WeSensePublisher
from wesense_ingester.signing.keys import IngesterKeyManager, KeyConfig
from wesense_ingester.signing.signer import ReadingSigner

INGESTION_NODE_ID = os.getenv("INGESTION_NODE_ID", socket.gethostname())
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "300"))  # seconds


class MyDataIngester:

    def __init__(self):
        # ── Logging ───────────────────────────────────────────��─
        self.logger = setup_logging("mydata_ingester")

        # ── Core pipeline components ────────────────────────────
        # These are all from wesense-ingester-core. You initialise
        # them once and call them for every reading.

        self.dedup = DeduplicationCache()
        self.geocoder = ReverseGeocoder()

        # Storage broker — receives readings via HTTP POST,
        # writes to ClickHouse and the archive pipeline.
        self.gateway_client = None
        try:
            self.gateway_client = GatewayClient(config=GatewayConfig.from_env())
        except Exception as e:
            self.logger.warning("No storage broker: %s (MQTT-only mode)", e)

        # MQTT publisher — publishes decoded readings for the
        # real-time map (Respiro) and P2P distribution via
        # the live transport.
        mqtt_config = MQTTPublisherConfig(
            broker=os.getenv("MQTT_BROKER", "localhost"),
            port=int(os.getenv("MQTT_PORT", "1883")),
            username=os.getenv("MQTT_USERNAME"),
            password=os.getenv("MQTT_PASSWORD"),
            client_id="mydata_publisher",
        )
        self.publisher = WeSensePublisher(config=mqtt_config)
        self.publisher.connect()

        # Ed25519 signing — auto-generates a key pair on first
        # run. The ingester_id is derived from the public key.
        key_config = KeyConfig.from_env()
        self.key_manager = IngesterKeyManager(config=key_config)
        self.key_manager.load_or_generate()
        self.signer = ReadingSigner(self.key_manager)
        self.logger.info(
            "Ingester ID: %s (key version %d)",
            self.key_manager.ingester_id,
            self.key_manager.key_version,
        )

        # ── Your data source setup ──────────────────────────────
        # Initialise your API client, MQTT subscriber, webhook
        # server, or whatever connects to your data source.
        # ...

        self._running = True

    # ── The core processing pipeline ────────────────────────────
    # This method is the same shape in every ingester. The only
    # difference is what fields you can fill in.

    def process_reading(
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
        """Process a single reading through the WeSense pipeline."""

        # 1. Deduplication — skip if we've seen this exact reading
        if self.dedup.is_duplicate(device_id, reading_type, timestamp):
            return

        # 2. Geocoding — convert lat/lon to ISO 3166 codes
        geo = self.geocoder.reverse_geocode(lat, lon)
        country = geo["geo_country"] if geo else ""
        subdivision = geo["geo_subdivision"] if geo else ""

        # 3. MQTT publish — for real-time map and P2P distribution.
        #    Include ALL fields that the storage broker writes to
        #    ClickHouse, so remote stations get complete data.
        mqtt_dict = {
            "timestamp": timestamp,
            "device_id": device_id,
            "data_source": "mydata",             # ← your data source ID
            "reading_type": reading_type,
            "value": value,
            "unit": unit,
            "latitude": lat,
            "longitude": lon,
            "geo_country": country,
            "geo_subdivision": subdivision,
            "node_name": station_name,
            "deployment_type": "OUTDOOR",
            "board_model": "",
        }
        self.publisher.publish_reading(mqtt_dict)

        # 4. Sign — Ed25519 signature over canonical JSON
        signing_dict = {
            "device_id": device_id,
            "data_source": "mydata",
            "timestamp": timestamp,
            "reading_type": reading_type,
            "value": value,
            "latitude": lat,
            "longitude": lon,
            "transport_type": "",
        }
        signed = self.signer.sign(
            json.dumps(signing_dict, sort_keys=True).encode()
        )

        # 5. Storage broker POST — buffered, auto-flushes
        if self.gateway_client:
            self.gateway_client.add({
                "timestamp": timestamp,
                "device_id": device_id,
                "data_source": "mydata",         # ← same as MQTT
                "data_source_name": "My Data",   # ← human-readable
                "network_source": "api",
                "ingestion_node_id": INGESTION_NODE_ID,
                "reading_type": reading_type,
                "value": float(value),
                "unit": unit,
                "latitude": float(lat),
                "longitude": float(lon),
                "altitude": None,
                "geo_country": country,
                "geo_subdivision": subdivision,
                "board_model": "",
                "sensor_model": "",
                "calibration_status": "",
                "deployment_type": "OUTDOOR",
                "deployment_type_source": "manual",
                "transport_type": "",
                "location_source": "manual",
                "node_name": station_name,
                "signature": signed.signature.hex(),
                "ingester_id": self.key_manager.ingester_id,
                "key_version": self.key_manager.key_version,
            })

    # ── Your data source loop ──────────────────────────────────
    # This is where YOUR code goes. Fetch data however your
    # source provides it, decode it, and call process_reading()
    # for each reading.

    def poll(self) -> None:
        """Fetch readings from your data source."""
        # Example: polling a REST API
        #
        # stations = my_api.get_stations()
        # for station in stations:
        #     readings = my_api.get_readings(station["id"])
        #     for r in readings:
        #         self.process_reading(
        #             device_id=f"mydata_{station['id']}",
        #             reading_type=r["type"],   # e.g. "temperature"
        #             value=r["value"],          # e.g. 22.5
        #             unit=r["unit"],            # e.g. "°C"
        #             timestamp=r["timestamp"],  # Unix epoch (int)
        #             lat=station["lat"],
        #             lon=station["lon"],
        #             station_name=station["name"],
        #         )
        pass

    # ── Lifecycle ──────────────────────────────────────────────

    def run(self) -> None:
        """Main loop — poll on interval until shutdown."""
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        self.logger.info("Starting (poll interval: %ds)", POLL_INTERVAL)
        while self._running:
            try:
                self.poll()
            except Exception as e:
                self.logger.error("Poll failed: %s", e)
            time.sleep(POLL_INTERVAL)

        self.shutdown()

    def _handle_signal(self, signum, frame):
        self.logger.info("Received signal %d, shutting down...", signum)
        self._running = False

    def shutdown(self) -> None:
        if self.gateway_client:
            self.gateway_client.close()
        self.publisher.close()
        self.logger.info("Shutdown complete.")


def main():
    ingester = MyDataIngester()
    ingester.run()


if __name__ == "__main__":
    main()
```

### 4. What You Write vs What Core Provides

| Responsibility                      | Who                   | Notes                                                                |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------- |
| Connect to data source              | **You**               | MQTT subscribe, HTTP poll, webhook server, etc.                      |
| Decode raw payload                  | **You**               | JSON, XML, protobuf, CSV — whatever your source sends                |
| Map fields to standard reading dict | **You**               | `reading_type`, `value`, `unit`, `device_id`, coordinates            |
| Deduplication                       | Core                  | `DeduplicationCache` — keyed on (device_id, reading_type, timestamp) |
| Reverse geocoding                   | Core                  | `ReverseGeocoder` — offline GeoNames, lat/lon → ISO 3166 codes       |
| Ed25519 signing                     | Core                  | `ReadingSigner` — auto-generated keys, canonical JSON signing        |
| Storage (ClickHouse)                | Core → Storage Broker | `GatewayClient.add()` — buffered HTTP POST to storage broker         |
| MQTT publish                        | Core                  | `WeSensePublisher.publish_reading()` — topic auto-constructed        |
| P2P distribution                    | Live Transport        | Automatic — subscribes to MQTT decoded topics, publishes to Zenoh    |
| Archiving to Parquet                | Storage Broker        | Automatic — archives to distributed blob store on schedule           |

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
| `transport_type`     | str   | Optional    | Sensor's first-hop connection (`wifi`, `lora`, `lorawan`), or empty               |
| `location_source`    | str   | Optional    | How coordinates were obtained (`gps`, `manual`, `network`)                        |

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
WORKDIR /app

# Copy and install the shared core library
COPY wesense-ingester-core/ /tmp/wesense-ingester-core/
RUN pip install --no-cache-dir /tmp/wesense-ingester-core && \
    rm -rf /tmp/wesense-ingester-core

# Install your ingester's dependencies
COPY wesense-ingester-mydata/requirements-docker.txt .
RUN pip install --no-cache-dir -r requirements-docker.txt

# Copy your ingester code
COPY wesense-ingester-mydata/mydata_ingester.py .
COPY wesense-ingester-mydata/adapters/ ./adapters/

RUN mkdir -p /app/cache /app/logs

ENV TZ=UTC
CMD ["python", "mydata_ingester.py"]
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

## Adding to Docker Compose

Once your ingester works, add it to `wesense/docker-compose.yml`:

```yaml
ingester-mydata:
  image: ghcr.io/wesense-earth/wesense-ingester-mydata:latest
  container_name: wesense-ingester-mydata
  environment:
    - GATEWAY_URL=http://storage-broker:8080
    - MQTT_BROKER=emqx
    - MQTT_PORT=1883
    - MQTT_USERNAME=${INGESTER_MYDATA_MQTT_USER:-}
    - MQTT_PASSWORD=${INGESTER_MYDATA_MQTT_PASS:-}
    # Your source-specific env vars:
    - MYDATA_API_URL=${MYDATA_API_URL:-}
    - POLL_INTERVAL=${MYDATA_POLL_INTERVAL:-300}
  volumes:
    - ingester-mydata-cache:/app/cache
    - ingester-mydata-logs:/app/logs
  profiles: [contributor, station]
  depends_on:
    config-check:
      condition: service_completed_successfully
  restart: unless-stopped
```

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
