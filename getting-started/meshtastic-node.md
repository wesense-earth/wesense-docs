# Meshtastic Node

[Meshtastic](https://meshtastic.org) is an open-source mesh networking project for LoRa radios. If you already have a Meshtastic device — or want to build one — you can contribute environmental telemetry to the WeSense network through the mesh.

WeSense doesn't replace Meshtastic or require special firmware. You run standard Meshtastic firmware with environmental sensors enabled, and WeSense picks up the telemetry data via MQTT.

## What You Need

- A **Meshtastic-compatible board** with LoRa radio (e.g. Heltec V3, LilyGo T-Beam, RAK WisBlock)
- One or more **environmental sensors** supported by Meshtastic (BME280, BME680, SHT4x, etc.)
- Standard [Meshtastic firmware](https://meshtastic.org/docs/getting-started/)

For hardware options and flashing instructions, see the [Meshtastic Getting Started guide](https://meshtastic.org/docs/getting-started/). WeSense doesn't prescribe specific hardware — any Meshtastic node with environmental sensors will work.

## Enable Environmental Telemetry

In the Meshtastic app or web interface:

1. Go to **Module Configuration → Telemetry**
2. Enable **Environment Metrics**
3. Set the **Update Interval** (e.g. 300 seconds / 5 minutes)
4. Ensure your sensors are wired and detected (check the device info screen)

Meshtastic supports sensors like BME280, BME680, SHT4x, and others. See the [Meshtastic Telemetry docs](https://meshtastic.org/docs/configuration/module/telemetry/) for the full list of supported sensors and wiring guides.

## MQTT Configuration

Your Meshtastic node's telemetry reaches WeSense via MQTT. There are two paths:

### Option 1: Via a Local Gateway (recommended)

If someone in your mesh neighbourhood is running a [Meshtastic Gateway](/getting-started/meshtastic-gateway), your data automatically flows through their gateway to WeSense. You don't need to configure anything on your node beyond enabling environmental telemetry.

This is the encouraged approach — it reduces dependency on the public Meshtastic MQTT servers and gives your community more control over the data path.

### Option 2: Via Public Meshtastic MQTT

If there's no local gateway, your data can reach WeSense through the public Meshtastic MQTT infrastructure at `mqtt.meshtastic.org`. WeSense subscribes to the public feed and ingests environmental telemetry from all regions.

For this to work, your node needs a path to the internet — either directly (WiFi-connected node) or via a gateway node that forwards to `mqtt.meshtastic.org`.

::: info Note on public MQTT
The public Meshtastic MQTT servers can experience instability. Running a local gateway gives you a more reliable path and lets you forward to both WeSense and the public Meshtastic network simultaneously.
:::

## How Your Data Reaches WeSense

```
Your Meshtastic Node (LoRa radio)
        ↓ mesh
Gateway Node (internet-connected)
        ↓ MQTT
WeSense Meshtastic Ingester
        ↓ decode protobuf + AES decrypt
        ↓ correlate position + telemetry
        ↓ geocode (ISO 3166)
ClickHouse + Live Map
```

Meshtastic sends position and environmental telemetry as separate messages (often minutes apart). The WeSense ingester caches positions per node and correlates them with incoming telemetry, so your sensor readings get tagged with the correct location.

### What Gets Ingested

The ingester extracts environmental metrics from Meshtastic telemetry messages:

- Temperature
- Humidity
- Barometric pressure
- Battery voltage (device health)

These are published as standard WeSense readings alongside data from all other sources — same geocoding, same deduplication, same ClickHouse schema, same live map.

## Deduplication

Meshtastic's mesh flooding means the same message can arrive multiple times via different paths. The WeSense ingester handles this automatically with an in-memory deduplication cache (keyed on node ID, reading type, and timestamp). ClickHouse's ReplacingMergeTree provides a second layer of safety.

Typical duplicate rates vary by region — from under 2% in sparse networks to over 50% in dense urban meshes. This is handled transparently; you don't need to worry about it.
