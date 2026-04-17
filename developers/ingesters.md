# Ingesters

Ingesters are the services that connect data sources to the WeSense network. Each ingester decodes source-specific payloads into a standard format and writes them to ClickHouse via the shared `wesense-ingester-core` library.

## Status

| Ingester | Data Source | Status | Notes |
|----------|------------|--------|-------|
| **wesense-ingester-wesense** | WeSense ESP32 sensors (WiFi + LoRa + TTN webhook) | Production | Primary ingester for WeSense hardware |
| **wesense-ingester-meshtastic** | Meshtastic mesh network | Production | Supports public and community modes |
| **wesense-ingester-homeassistant** | Home Assistant REST/WebSocket API | Pending testing | Standalone ingester — pulls data from HA via API |
| **wesense-ha-plugin** | Home Assistant add-on | Coming soon | Native HA integration — will be available in the HACS community store |
| **wesense-ingester-govaq-nz** | NZ government air quality (ECan + Hilltop councils) | Production | Reference-grade station data |
| **wesense-ingester-govaq-au** | Australian government air quality (NSW, QLD, ACT + more) | Production | Reference-grade station data from 6 state/territory sources |
| **wesense-ingester-ecowitt** | Ecowitt weather stations (direct) | Coming soon | Direct integration without Home Assistant |

All production ingesters are deployed as Docker containers via the [deployment profiles](/station-operators/deployment-profiles).

## How Ingesters Work

Every ingester follows the same pattern:

```
Data Source → Adapter (decode) → wesense-ingester-core (geocode, dedup, batch) → ClickHouse
                                                                               → MQTT publish
```

1. **Connect** to a data source (MQTT subscription, HTTP webhook, REST API, WebSocket)
2. **Decode** source-specific payloads into standard Python dicts
3. **Pass to core** — the shared `wesense-ingester-core` library handles geocoding (ISO 3166), deduplication, batching, and storage

The core library ensures consistent behaviour across all ingesters — the same geocoding, the same dedup logic, the same ClickHouse schema. An adapter is typically a single Python file with a few hundred lines of source-specific decode logic.

## Writing a New Ingester

If you want to connect a new data source to WeSense, see [Writing an Ingester](/developers/writing-an-ingester) for a step-by-step guide.

Potential ingesters the community could build:

- **sensor.community** — community PM2.5 network (open API, complementary data)
- **Open-Meteo** — weather reanalysis data (ERA5) for cross-reference
- **Other LoRaWAN networks** — Helium, Chirpstack, etc.
- **Custom hardware** — any sensor that can publish MQTT or POST JSON
