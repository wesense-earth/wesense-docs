# Meshtastic Gateway

A Meshtastic gateway bridges your local mesh network to the internet. Environmental telemetry from nearby Meshtastic nodes flows through your gateway into WeSense automatically — and optionally to the public Meshtastic network and third-party maps as well.

Running a gateway is one of the most valuable infrastructure contributions you can make.

<!-- IMAGE: /images/stations/meshtastic-gateway-setup.jpg — Photo of a Meshtastic gateway node next to a Pi/server --> It gives your local mesh neighbourhood a reliable, community-controlled path to the WeSense network without depending on the public Meshtastic MQTT servers.

## What You Need

- A **Meshtastic node with internet connectivity** — any Meshtastic-compatible board (Heltec V3, T-Beam, RAK WisBlock, etc.) connected to WiFi or Ethernet
- A **WeSense station** running the `meshtastic` Docker profile — this runs the ingester that decodes and stores the data
- Or, configure your gateway to forward MQTT to `mqtt.wesense.earth` directly

## What a Gateway Does

```
Meshtastic Nodes (LoRa mesh)
        ↓ radio
Your Gateway (internet-connected Meshtastic node)
        ↓ MQTT
Your Local EMQX Broker (part of WeSense station)
        ↓
WeSense Meshtastic Ingester (decode, correlate, geocode)
        ↓
ClickHouse + Live Map
        ↓ (optional forwarding)
mqtt.meshtastic.org / Liam Cottle map / etc.
```

Your gateway receives mesh traffic over LoRa and publishes it to your local MQTT broker. The WeSense ingester subscribes, decodes the protobuf messages, decrypts them (AES-CTR with the standard Meshtastic key), correlates position with telemetry, geocodes the location, and stores the data.

## MQTT Forwarding

Your gateway can forward mesh traffic to multiple destinations simultaneously. WeSense supports configurable forwarding slots in the `.env` file:

| Destination | Purpose |
|------------|---------|
| **WeSense (local ingester)** | Primary — stores data in ClickHouse, appears on the WeSense map |
| **mqtt.meshtastic.org** | Optional — contributes to the public Meshtastic network |
| **mqtt.meshtastic.liamcottle.net** | Optional — contributes to Liam Cottle's Meshtastic map |

This means running a gateway doesn't take data away from the Meshtastic community — you can feed WeSense and the public network at the same time.

## Setup

### 1. Configure Your Meshtastic Node as a Gateway

In the Meshtastic app or web interface:

1. Go to **Module Configuration → MQTT**
2. Enable **MQTT**
3. Set the MQTT server to your local EMQX broker address (e.g. `192.168.1.100`)
4. Set credentials (configured in your WeSense `.env` file)
5. Enable **Encryption Enabled** if your mesh uses encryption (default)

### 2. Enable the Meshtastic Profile on Your Station

In your WeSense station's `.env` file, enable the meshtastic profile:

```bash
COMPOSE_PROFILES=guardian,meshtastic
```

This starts the `wesense-ingester-meshtastic` container in community mode, which subscribes to your local EMQX broker for mesh traffic.

### 3. Configure Forwarding (Optional)

To also forward mesh traffic to the public Meshtastic network:

```bash
MESHTASTIC_FORWARDING_ENABLED=true
MESHTASTIC_FWD_1_ENABLED=true   # Liam Cottle map
MESHTASTIC_FWD_2_ENABLED=true   # mqtt.meshtastic.org
```

Forwarding is handled by EMQX bridge rules — your gateway publishes once to your local broker, and EMQX forwards to the configured destinations.

## Community vs Downlink Mode

The WeSense Meshtastic ingester has two modes:

| Mode | Environment Variable | What It Does |
|------|---------------------|-------------|
| **Community** (default) | `MESHTASTIC_MODE=community` | Ingests from your local EMQX broker — traffic from your own gateway |
| **Downlink** | `MESHTASTIC_MODE=downlink` | Subscribes to `mqtt.meshtastic.org` directly and ingests public mesh traffic from 30+ regional feeds worldwide |

**Community mode** is for gateway operators — you run a gateway and ingest your local mesh.

**Downlink mode** is for hub operators who want to ingest global Meshtastic data without running their own gateway. It uses the public Meshtastic MQTT credentials (`meshdev` / `large4cats`) and subscribes to regional topics like `msh/ANZ/#`, `msh/US/#`, `msh/EU_868/#`.

::: warning Downlink mode — use with caution
Downlink mode subscribes to the global public Meshtastic MQTT feed, which generates very high traffic volumes and significant deduplication overhead. Most operators should **not** enable this. Use community mode with a local gateway instead.

As the WeSense network grows, we plan to evolve downlink so that country nodes can subscribe to just their own country's feed — taking on responsibility for their region's Meshtastic data rather than every node pulling the entire world. This is a developing area.
:::

::: warning Public MQTT instability
The public Meshtastic MQTT servers (`mqtt.meshtastic.org`) can experience instability and downtime. Running your own gateway with community mode is more reliable and gives you control over your data path.
:::

## Encryption

Meshtastic encrypts mesh traffic with AES-256 in CTR mode. The WeSense ingester decrypts automatically using the standard Meshtastic default key. If your mesh uses a custom channel key, set it via:

```bash
MESHTASTIC_CHANNEL_KEY=your_base64_key_here
```

The default key (`AQ==`) works for the standard Meshtastic public channel.
