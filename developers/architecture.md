# Architecture Overview

WeSense is a distributed environmental sensor network. Sensors collect readings and transmit them via WiFi, LoRaWAN, or mesh networks. Data flows through ingesters that decode, geocode, and store readings in ClickHouse. Archives are replicated across the network via P2P for permanent, open access.

## Data Flow

```
ESP32 Sensors --WiFi/MQTT--> EMQX broker --> wesense-ingester-wesense
              --LoRaWAN----> TTN --webhook--> wesense-ingester-wesense
Meshtastic    --mesh-------> mqtt.meshtastic.org --> wesense-ingester-meshtastic
Home Asst.    --WebSocket/REST--> wesense-ingester-homeassistant

All ingesters:
  raw input -> decode -> geocode (ISO 3166) -> dedup -> batch -> ClickHouse
                                                              -> MQTT publish
                                                              -> Respiro (live map)
```

## Core Components

<!-- TODO: Component descriptions, responsibilities, how they connect -->

## P2P Architecture

<!-- TODO: Public-safe overview of Zenoh live distribution + Iroh archive replication -->

## Technology Stack

<!-- TODO: Summary table of languages, frameworks, databases -->
