# Features

WeSense is a full-stack environmental monitoring system — from sensor firmware to community-operated infrastructure to open data archiving. Here's what's in the box.

<!-- IMAGE: /images/screenshots/respiro-map-overview.png — Screenshot of Respiro map showing sensors across a region -->

## Sensor Firmware

The WeSense firmware runs on ESP32 boards and handles everything from sensor reading to data transmission.

### Plug and Play
- **Automatic board detection** — one firmware image runs on all supported ESP32 boards (DevKit, C3, C6, S3, T-Beam)
- **Automatic sensor detection** — plug in any supported sensor and the firmware finds it at startup. No configuration needed.
- **Sensor priority system** — when multiple sensors measure the same thing, the firmware automatically uses the most reliable reading

### Connectivity
- **WiFi** with MQTTS (TLS-encrypted MQTT) — data is encrypted in transit by default
- **LoRaWAN** via The Things Network — for locations without WiFi. Default WeSense TTN credentials are built in.
- **GPS support** — T-Beam boards auto-detect location. Other boards use configurable fixed coordinates.
- **Home Assistant auto-discovery** — sensors automatically appear in any Home Assistant instance on your local network via MQTT discovery. Your environmental data feeds both WeSense and your home automation simultaneously, with no manual configuration.
- **NTP time synchronisation** — accurate timestamps on every reading, with daylight saving support

### Remote Management
- **MQTT command interface** — calibrate sensors, update location, restart device, toggle LEDs, check status — all remotely via MQTT or a GUI like [MQTT Explorer](https://mqtt-explorer.com)
- **Remote serial logging** via Telnet — connect to your sensor's debug output over the network, no USB cable needed
- **Syslog support** — forward diagnostic logs to a remote syslog server
- **Boasting URL** — point your node to a URL showing how you set it up, shared with the network

### Deployment Flexibility
- **Indoor, outdoor, and mixed** installation types — the firmware tags readings with deployment context
- **Privacy offset** — configurable coordinate offset so your data represents your neighbourhood without revealing your exact address
- **Deep sleep support** — for battery/solar LoRaWAN deployments where power is limited. Not supported by all sensors — check that your sensors resume correctly after a deep sleep cycle before relying on this.
- **Disable individual sensors** — turn off specific sensors in software, even individual sensors within multi-sensor boards

### Calibration & Reliability
- **Calibration persistence** — sensor calibration state is saved to NVS and designed to survive power cycles and firmware updates, so CO2 sensors that take 7 days to calibrate don't lose progress. This capability is implemented but still being evaluated for reliability — consider it alpha-quality for now.
- **Calibration state tracking** — the firmware knows which sensors are still warming up and suppresses their data until calibration is complete
- **Data quality protection** — readings are only published when time sync is confirmed, preventing timestampless data from entering the network

### Supported Sensors
- Temperature & humidity (SHT45, SHT41, TMP117, AHT20, SHTC3)
- CO2 (SCD30, SCD40/41, CM1106-C)
- Pressure (MS5611, BMP390, BME280, BMP280)
- Particulate matter (SPS30, PMS5003, SDS011)
- VOC/NOx (SGP41, SGP40, BME680)
- Light (TSL2591, BH1750, VEML7700)
- UV (LTR-390UV)
- Power monitoring (INA226, INA219)
- Noise (INMP441)
- Multi-sensor modules (SEN54, SEN55, SEN66, SEN68)

See [Recommended Sensors](/getting-started/recommended-sensors) for our picks and why.

> Have a sensor that's not listed here? [Submit it on GitHub](https://github.com/wesense-earth/wesense-sensor-firmware/issues) and we'll prioritise adding support — assuming it's not a very drifty sensor, of course.

---

## Run a Node

The WeSense network is community-operated. Sensors collect the data, but nodes are the infrastructure that stores, replicates, and serves it. Running a node is one of the most impactful ways to contribute.

### What a Node Does

A node runs as a set of Docker containers on a Raspberry Pi, home server, or NAS. Depending on your [deployment profile](/station-operators/deployment-profiles), it can include:

- **Data ingesters** — decode sensor data from MQTT, Meshtastic, Home Assistant, government APIs, and other sources
- **ClickHouse database** — store and query time-series sensor data locally
- **MQTT broker (EMQX)** — receive sensor data directly from devices in your area
- **Respiro dashboard** — visualise sensor data on a map and monitor your environment
- **P2P archive replication** — store and serve Parquet archives for your chosen regions

### Storage Scopes

Every node chooses what data to store and replicate. The network needs nodes at every level:

| Storage Scope | What Gets Stored | Who It's For |
|--------------|-----------------|-------------|
| `nz/wgn` | Just Wellington | A sensor operator backing up their local area |
| `nz/*` | All of New Zealand | A country node |
| `nz/*,au/*` | New Zealand and Australia | A regional node serving Oceania |
| `*/*` | Everything on the network | A world node — the ultimate backup |

The more nodes that store a region's data, the more copies exist, and the more resilient that data becomes. Serving is automatic — everything in your store is available for any peer to pull. The network self-heals as nodes join and leave.

<!-- IMAGE: /images/diagrams/storage-scope-map.svg — World map with coloured regions showing what different storage scopes cover -->

### Node Types

| Type | What It Runs | Best For |
|------|-------------|----------|
| **Contributor** | Ingesters only | Sensor operators forwarding data to a remote hub |
| **Guardian** | Full stack (MQTT, ClickHouse, Ingesters, Respiro, P2P) | The backbone of the network — stores, serves, and replicates data |
| **Hub** | MQTT broker only | A public MQTT entry point for sensors in your area |

See [Operate a Station](/station-operators/operate-a-station) to get started.

### Visualisation — Respiro

Every node running the Guardian profile includes [Respiro](https://map.wesense.earth), a built-in dashboard that serves multiple roles:

<!-- IMAGE: /images/screenshots/respiro-telemetry.png — Screenshot of Respiro telemetry viewer showing sensor readings over time -->
<!-- IMAGE: /images/screenshots/respiro-choropleth.png — Screenshot of choropleth overlay showing regional heatmap -->

- **Global sensor map** — see every sensor on the network, zoom from world view to street level
- **Telemetry viewer** — drill into individual sensor readings over time
- **Home monitoring dashboard** — track your own indoor/outdoor environment
- **Status dashboard** — network health, sensor uptime, data coverage
- **Choropleth overlays** — regional heatmaps showing environmental conditions by area

### Build Your Own Visualisation

Respiro is a starting point, not the end goal. All WeSense data is open and queryable via ClickHouse, MQTT subscriptions, and Parquet archives — so anyone can build their own tools on top of it. Whether you want to build a specialised air quality dashboard, integrate WeSense data into an existing platform, or create something entirely new — the data is there. We're keen to link to and promote third-party visualisations that use WeSense data as a base.

---

## Open Data Platform

Everything above is built on an open data platform designed so that no single entity controls the data.

### Ingestion
- **Multiple data sources** — WeSense sensors, Meshtastic mesh networks, Home Assistant, government air quality stations, with more coming via community-built [ingesters](/developers/ingesters)
- **Shared ingester core** — all data sources go through the same geocoding, deduplication, and storage pipeline
- **ISO 3166 geocoding** — every reading is tagged with country and subdivision codes from coordinates

### Storage
- **ClickHouse** time-series database — fast queries over billions of readings
- **Parquet archiving** — daily archives exported in open Parquet format, readable by ClickHouse, Pandas, DuckDB, Apache Spark, and most data science and climate science tools
- **Free and open data** — all sensor data is accessible to anyone, forever

### P2P Replication
- **Iroh archive replication** — Parquet archives distributed across nodes via P2P with zero central dependency
- **Zenoh live distribution** — real-time sensor data streamed between nodes via P2P
- **Community-driven** — operators choose their storage scope, and the network self-heals as nodes join and leave

---

## What's Coming

See the [Roadmap](https://wesense.earth/#roadmap) for planned features, including:
- Web-based firmware flasher (no Arduino IDE needed)
- Direct Ecowitt integration
- Home Assistant add-on via HACS
- CGNAT/dynamic IP support via DERP relays
- Hardware enclosure designs for 3D printing
- Network storage size dashboard (total data by world, country, and region)
