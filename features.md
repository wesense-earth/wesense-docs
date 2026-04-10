# Features

WeSense is a full-stack environmental monitoring system — from sensor firmware to data archiving. Here's what's in the box.

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
- **NTP time synchronisation** — accurate timestamps on every reading, with daylight saving support

### Remote Management
- **MQTT command interface** — calibrate sensors, update location, restart device, toggle LEDs, check status — all remotely via MQTT
- **Remote serial logging** via Telnet — connect to your sensor's debug output over the network, no USB cable needed
- **Syslog support** — forward diagnostic logs to a remote syslog server
- **Boasting URL** — point your node to a URL showing how you set it up, shared with the network

### Deployment Flexibility
- **Indoor, outdoor, and mixed** installation types — the firmware tags readings with deployment context
- **Privacy offset** — configurable coordinate offset so your data represents your neighbourhood without revealing your exact address
- **Deep sleep support** — for battery/solar LoRaWAN deployments where power is limited (note: some sensors need recalibration after deep sleep)
- **Disable individual sensors** — turn off specific sensors in software, even individual sensors within multi-sensor boards

### Calibration & Reliability
- **Calibration persistence** — sensor calibration state is saved to NVS and survives power cycles and firmware updates. CO2 sensors that take 7 days to calibrate don't lose progress.
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

---

## Data Platform

### Ingestion
- **Multiple data sources** — WeSense sensors, Meshtastic mesh networks, Home Assistant, government air quality stations, with more coming
- **Shared ingester core** — all data sources go through the same geocoding, deduplication, and storage pipeline
- **ISO 3166 geocoding** — every reading is tagged with country and subdivision codes from coordinates

### Storage & Access
- **ClickHouse** time-series database — fast queries over billions of readings
- **IPFS archiving** — daily Parquet archives stored on the permanent web
- **Free and open data** — all sensor data is accessible to anyone, forever

### P2P Network
- **Iroh archive replication** — archives are distributed across stations via P2P with zero central dependency
- **Zenoh live distribution** — real-time sensor data streamed between stations via P2P
- **Community-driven replication** — the more stations, the more resilient the data

### Visualisation
- **Live sensor map** ([map.wesense.earth](https://map.wesense.earth)) — see sensor data in real time
- **Choropleth overlays** — regional heatmaps showing environmental conditions by area

---

## What's Coming

See the [Roadmap](https://wesense.earth/#roadmap) for planned features, including:
- Web-based firmware flasher (no Arduino IDE needed)
- Direct Ecowitt integration
- Home Assistant add-on via HACS
- CGNAT/dynamic IP support via DERP relays
- Hardware enclosure designs for 3D printing
