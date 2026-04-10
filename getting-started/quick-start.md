# Quick Start

There are several ways to contribute sensor data to WeSense. The right path depends on what you already have.

## I already have sensors

If you already have environmental sensors (Ecowitt weather stations, Home Assistant devices, or anything that publishes MQTT), you can start contributing data immediately.

**Point your sensors at the WeSense MQTT broker:**

```
Host: mqtt.wesense.earth
Port: 8883 (MQTTS)
```

Your data will be ingested, geocoded, and appear on the [live map](https://map.wesense.earth). See the [MQTT topic structure](/developers/data-schema#mqtt-topic-structure) for payload format.

If you're running **Home Assistant**, see the [Home Assistant / Ecowitt guide](/getting-started/home-assistant) — there's a dedicated ingester that pulls data from your HA instance.

## I want to build a sensor

### WiFi (simplest)

Build a WeSense node using an ESP32 board and environmental sensors. It connects to your WiFi and reports readings every 5 minutes directly to `mqtt.wesense.earth`.

1. Choose your hardware — see [Recommended Sensors](/getting-started/recommended-sensors)
2. Wire and flash — see [Build a WeSense Node](/getting-started/build-wesense-node)
3. Configure WiFi and MQTT, power it on — data flows automatically

**Cost:** From ~$15 (basic temp/humidity) to ~$120 (full environmental suite)

### LoRaWAN (no WiFi needed)

If your sensor location doesn't have WiFi, you can transmit over LoRaWAN via The Things Network (TTN). You'll need a free TTN account and a LoRaWAN gateway within range (check [TTN coverage](https://www.thethingsnetwork.org/map)).

1. Build a WeSense node with a LoRa-capable board (e.g. T-Beam)
2. Register on [The Things Network](https://www.thethingsnetwork.org/) (free — the Sandbox plan is sufficient)
3. Flash the firmware with LoRaWAN enabled
4. Data is relayed via TTN webhook to the WeSense ingester

::: info TTN Free Account Limits
The Things Stack Sandbox (free) allows 30 seconds of uplink airtime per day per node, and 10 downlink messages per day. WeSense reports every 5 minutes (288 uplinks/day) with small protobuf payloads — this fits within the free tier at typical spreading factors, though nodes at the edge of gateway range (high spreading factors) may need to report less frequently.
:::

### Meshtastic (mesh network)

Add environmental sensors to a Meshtastic device. Your readings travel across the mesh network and into WeSense automatically — no internet connection needed at your sensor location, as long as there's a gateway node somewhere in the mesh.

- [Meshtastic Node](/getting-started/meshtastic-node) — Add sensors to a Meshtastic device
- [Meshtastic Gateway](/getting-started/meshtastic-gateway) — Bridge your local mesh to the internet

## I want to run a station

Running a station means hosting the full WeSense stack — MQTT broker, database, ingesters, map, and P2P replication. Your station stores and serves data for your region, making the network more resilient.

This requires a Raspberry Pi, home server, or NAS. See [Operate a Station](/station-operators/operate-a-station).

## I want to contribute code

See the [Developer docs](/developers/architecture) for architecture overview, or jump straight to [Writing an Ingester](/developers/writing-an-ingester) if you want to connect a new data source.

## What happens to my data?

All sensor data contributed to WeSense is:

- **Free and open** — anyone can access it, forever
- **Stored in ClickHouse** — queryable time-series database
- **Archived to IPFS** — permanent, decentralised storage
- **Replicated via P2P** — distributed across stations so no single point of failure
- **Visible on the [live map](https://map.wesense.earth)** — within seconds of arriving
