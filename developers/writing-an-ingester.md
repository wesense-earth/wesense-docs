# Writing an Ingester

An ingester is a Python service that connects to a data source, decodes readings into a standard format, and writes them to ClickHouse via the shared `wesense-ingester-core` library.

## How Ingesters Work

All ingesters follow the same pattern:

1. **Connect** to a data source (MQTT, HTTP webhook, REST API, WebSocket)
2. **Decode** source-specific payloads into standard Python dicts
3. **Pass to core** — geocoding, deduplication, batching, and storage are all handled by `wesense-ingester-core`

## Getting Started

<!-- TODO: Step-by-step guide to creating a new ingester -->
<!-- Include: repo setup, core library dependency, adapter structure -->

## The Standard Reading Dict

<!-- TODO: Document the expected fields, types, and optional values -->

## Existing Ingesters as Examples

| Ingester | Data Source | Complexity |
|----------|------------|------------|
| `wesense-ingester-wesense` | MQTT + TTN webhook | Medium — protobuf decode, LoRa metadata |
| `wesense-ingester-meshtastic` | MQTT | Medium — protobuf + AES decrypt |
| `wesense-ingester-homeassistant` | REST + WebSocket | Simple — JSON, loop prevention |
| `wesense-ingester-govaq-nz` | REST (Hilltop API) | Simple — XML/JSON government data |

## Testing

<!-- TODO: How to test an ingester locally -->

## Deployment

<!-- TODO: Docker build, CI/CD, adding to docker-compose profiles -->
