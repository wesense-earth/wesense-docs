# Home Assistant / Ecowitt Integration

Already running Home Assistant with Ecowitt weather stations or other environmental sensors? The WeSense Home Assistant plugin forwards your sensor data to the WeSense network — no additional hardware needed.

::: warning Coming Soon
This integration is implemented but not yet tested in the field. Consider it alpha-quality. Installation via HACS is planned but not yet available — for now, manual installation is required.
:::

## How It Works

The WeSense plugin runs inside Home Assistant and listens for state changes on sensor entities you select. When a sensor reading changes, the plugin converts it to WeSense format and posts it directly to a WeSense storage gateway via HTTP.

```
Your Sensors (e.g. Ecowitt GW2000)
        ↓
Home Assistant (via Ecowitt integration)
        ↓ state change event
WeSense Plugin (converts + forwards)
        ↓ HTTP POST
WeSense Storage Gateway
        ↓
ClickHouse + Live Map
```

You choose exactly which sensor entities to forward — the plugin doesn't auto-discover or send everything.

## Which Sensors Should I Include?

The plugin works with any Home Assistant sensor entity that has a numeric value and a recognised device class. However, not all sensors are suitable for an environmental monitoring network.

**Include:** Dedicated environmental sensors with known accuracy and stability — Ecowitt weather stations are the primary use case. These are purpose-built instruments with calibrated sensors.

**Avoid:** Sensors embedded in consumer appliances (smart heaters, displays, smart plugs with temperature) — these tend to be unreliable, poorly calibrated, and affected by the heat of the device itself. They're useful for home automation but not for environmental data.

### Supported Reading Types

The plugin maps Home Assistant device classes to WeSense reading types:

| HA Device Class | WeSense Reading Type |
|----------------|---------------------|
| `temperature` | temperature |
| `humidity` | humidity |
| `pressure` / `atmospheric_pressure` | pressure |
| `carbon_dioxide` | co2 |
| `carbon_monoxide` | co |
| `pm1` | pm1_0 |
| `pm25` | pm2_5 |
| `pm10` | pm10 |
| `volatile_organic_compounds` | voc |
| `nitrogen_dioxide` | no2 |
| `ozone` | o3 |
| `sulphur_dioxide` | so2 |
| `aqi` | aqi |
| `illuminance` | light_level |
| `sound_pressure` | sound_level |
| `wind_speed` | wind_speed |
| `precipitation` | precipitation |
| `precipitation_intensity` | precipitation_intensity |

Sensors with unmapped device classes are skipped. The plugin also attempts to infer the reading type from the entity ID if the device class isn't set (e.g. an entity named `sensor.backyard_pm2_5` will be recognised as PM2.5).

### Unit Conversion

The plugin automatically converts units to WeSense standards:

| From | To | Example |
|------|-----|---------|
| Fahrenheit | Celsius | 72°F → 22.2°C |
| Kelvin | Celsius | 295K → 21.9°C |
| inHg, mmHg, Pa, kPa | hPa | 29.92 inHg → 1013.2 hPa |
| mph, km/h, knots | m/s | 10 mph → 4.5 m/s |

## Installation

### Manual Installation (current method)

1. Copy the `custom_components/wesense` folder from the [wesense-ha-plugin repository](https://github.com/wesense-earth/wesense-ha-plugin) into your Home Assistant `config/custom_components/` directory
2. Restart Home Assistant
3. Go to **Settings → Devices & Services → Add Integration**
4. Search for **WeSense**

### HACS Installation (planned)

Once the plugin is published to the HACS community store, you'll be able to install it directly from **HACS → Integrations → Search "WeSense"**.

## Configuration

### Step 1: Gateway & Location

| Setting | Default | Description |
|---------|---------|-------------|
| **Gateway URL** | `http://localhost:8080` | Address of your WeSense storage gateway. If running a local WeSense station, use its IP. |
| **Device Prefix** | `ecowitt` | Used to build device IDs (e.g. `ha_ecowitt_outdoor_temperature`). Use something descriptive for your setup. |
| **Node Name** | `Home Assistant` | Friendly name for this HA instance on the WeSense network. |
| **Latitude / Longitude** | From HA config | Location for your sensors. Defaults to your Home Assistant configured location. |
| **Board Model** | `ECOWITT` | Hardware model identifier. |
| **Deployment Type** | `OUTDOOR` | `INDOOR`, `OUTDOOR`, or `MIXED` — how your sensors are deployed. |

### Step 2: Select Entities

Choose which sensor entities to forward to WeSense. Only numeric sensor entities are shown. Select the environmental sensors you want to contribute — at least one is required.

### Reconfiguration

After setup, you can update the gateway URL, node name, and entity selection at any time via **Settings → Devices & Services → WeSense → Configure**.

## Monitoring

The plugin creates a diagnostic sensor entity: `sensor.wesense_{prefix}_readings_forwarded`

This shows:
- **State**: Total count of readings forwarded
- **Attributes**: Gateway URL, gateway reachability, tracked entity count, last forward time

## Debouncing

The plugin enforces a minimum 60-second interval between forwards per entity to prevent flooding the network with rapid state changes. Readings that arrive within 60 seconds of the last forward for that entity are silently skipped.

## Loop Prevention

Every reading posted by the plugin is tagged with `data_source: "home_assistant"`. If you're also running the standalone `wesense-ingester-homeassistant` Docker container, it uses this tag to filter out readings that originated from the plugin — preventing circular data flow between Home Assistant and WeSense.

## Two Integration Options

There are two ways to connect Home Assistant to WeSense:

| Option | How It Works | Best For |
|--------|-------------|----------|
| **This plugin (HACS)** | Runs inside HA, pushes data via HTTP | Simple setup, no Docker needed, best for most users |
| **wesense-ingester-homeassistant (Docker)** | Pulls from HA REST/WebSocket API | Station operators already running Docker, can run without modifying HA |

The Docker ingester is a separate service documented under [Ingesters](/developers/ingesters). Both options are pending field testing.
