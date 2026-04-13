# Topic Structure

Topics are the routing mechanism for both sensor-to-ingester (MQTT) and ingester-to-consumer (libp2p pub/sub) communication.

## Sensor → Ingester (MQTT Topics)

All sensors (WiFi and LoRaWAN) publish using the **v2 consolidated protobuf format**. This unified approach simplifies code and maximises bandwidth efficiency.

**Topic Format:**

```
wesense/v2/{country}/{subdivision}/{device_id}
```

**Components:**

- `wesense/v2` - Protocol identifier and version
- `{country}` - ISO 3166-1 alpha-2 country code, lowercase (e.g., `nz`, `au`, `us`, `gb`)
- `{subdivision}` - ISO 3166-2 subdivision code, lowercase (e.g., `auk`, `qld`, `ca`, `sct`)
- `{device_id}` - Unique device identifier: `{location}_{mac_address}` (e.g., `office_301274c0e8fc`)

Note: No `{reading_type}` suffix - all readings are consolidated in one message.

**ISO 3166-2 Subdivision Examples:**

| Country        | Code | Subdivision     | Code  |
| -------------- | ---- | --------------- | ----- |
| New Zealand    | `nz` | Auckland        | `auk` |
| New Zealand    | `nz` | Wellington      | `wgn` |
| New Zealand    | `nz` | Canterbury      | `can` |
| Australia      | `au` | New South Wales | `nsw` |
| Australia      | `au` | Queensland      | `qld` |
| Australia      | `au` | Victoria        | `vic` |
| United States  | `us` | California      | `ca`  |
| United States  | `us` | Texas           | `tx`  |
| United States  | `us` | New York        | `ny`  |
| United Kingdom | `gb` | England         | `eng` |
| United Kingdom | `gb` | Scotland        | `sct` |

Full reference: https://en.wikipedia.org/wiki/ISO_3166-2

**Examples:**

```
wesense/v2/nz/auk/office_301274c0e8fc
wesense/v2/au/qld/brisbane_a1b2c3d4e5f6
wesense/v2/us/ca/sf_downtown_x9y8z7w6
wesense/v2/gb/sct/edinburgh_123456abcdef
```

**Payload (v2 Protobuf):**

All sensors transmit binary protobuf using the `SensorReadingV2` message format:

```protobuf
message SensorReadingV2 {
  fixed64 device_id = 1;              // MAC as uint64
  fixed32 timestamp = 2;              // Unix epoch seconds
  sfixed32 latitude_e5 = 3;           // Latitude × 100000
  sfixed32 longitude_e5 = 4;          // Longitude × 100000
  Vendor vendor = 5;                  // WESENSE, MESHTASTIC, etc.
  ProductLine product_line = 6;       // HOMEBREW, SENTINEL, etc.
  DeviceType device_type = 7;         // BEACON, WATCHPOINT, etc.
  DeploymentType deployment_type = 8; // INDOOR, OUTDOOR, MIXED
  TransportType transport_type = 9;   // WIFI_MQTT, LORAWAN, etc.
  repeated SensorValue measurements = 10;  // All sensor readings
}

message SensorValue {
  ReadingType reading_type = 1;   // TEMPERATURE, HUMIDITY, CO2, etc.
  float value = 2;                // The measurement value
  SensorModel sensor_model = 3;   // SHT4X, SCD4X, PMS5003, etc.
}
```

**Payload Size:**

| Configuration                            | Sensors | Size       |
| ---------------------------------------- | ------- | ---------- |
| Minimal (temp, humidity)                 | 2       | ~50 bytes  |
| Standard (temp, humidity, CO2, pressure) | 4       | ~65 bytes  |
| Full (8 sensors)                         | 8       | ~100 bytes |

This is 8-10x more efficient than JSON and fits within LoRaWAN payload limits.

**Decoded JSON (after protobuf decoder):**

```json
{
  "device_id": "0x0000301274C0E8FC",
  "timestamp": 1732291200,
  "latitude": -36.848461,
  "longitude": 174.763336,
  "vendor": "WESENSE",
  "product_line": "HOMEBREW",
  "device_type": "BEACON",
  "deployment_type": "INDOOR",
  "transport_type": "WIFI_MQTT",
  "measurements": [
    {"reading_type": "TEMPERATURE", "value": 22.5, "sensor_model": "SHT4X"},
    {"reading_type": "HUMIDITY", "value": 65.3, "sensor_model": "SHT4X"},
    {"reading_type": "CO2", "value": 850.0, "sensor_model": "SCD4X"},
    {"reading_type": "PRESSURE", "value": 1013.25, "sensor_model": "BMP280"}
  ]
}
```

## Ingester → Network (Zenoh Key Expressions)

The `wesense-live-transport` subscribes to MQTT decoded topics (`wesense/decoded/#`) and publishes each reading to the Zenoh P2P network. Each reading is wrapped in a `SignedReading` protobuf envelope (Ed25519 signature + live transport identity) before publishing. Ingesters do not interact with Zenoh directly.

**Key expression structure:**

```
wesense/v2/live/{country}/{subdivision}/{device_id}
```

Zenoh uses **key expressions** with native wildcard support:

- `*` matches a single level (like MQTT `+`)
- `**` matches multiple levels (like MQTT `#`)

Since v2 messages contain all readings, there's no per-reading-type key. Consumers subscribe by region and filter locally if needed.

**Key Expression Hierarchy:**

| Key Expression             | Description                                | Example Subscribers    |
| -------------------------- | ------------------------------------------ | ---------------------- |
| `wesense/v2/live/nz/auk/*` | All devices in Auckland                    | Auckland-focused map   |
| `wesense/v2/live/nz/**`    | Everything in New Zealand                  | NZ regional map        |
| `wesense/v2/live/au/qld/*` | All devices in Queensland                  | QLD regional map       |
| `wesense/v2/live/us/ca/**` | Everything in California                   | CA regional map        |
| `wesense/v2/live/**`       | Global firehose (not recommended at scale) | Research/archival node |

**Queryable requests** (distributed queries via Zenoh, see P2P_Preparation.md section 2.1):

| Request             | Response                       | Use Case                  |
| ------------------- | ------------------------------ | ------------------------- |
| `"summary"`         | Country/subdivision aggregates | Choropleth at zoom-out    |
| `"latest"`          | Latest reading per device      | Sensor markers at zoom-in |
| `"history?hours=2"` | Recent readings for catchup    | Late-joiner gap fill      |
| `"devices"`         | Device list with metadata      | Map filtering and search  |

**Reading Types (within each message):**

- `TEMPERATURE` - Temperature (deg C)
- `HUMIDITY` - Relative humidity (%)
- `CO2` - Carbon dioxide (ppm)
- `PRESSURE` - Barometric pressure (hPa)
- `PM1`, `PM25`, `PM10` - Particulate matter (ug/m3)
- `VOC_INDEX`, `NOX_INDEX` - Air quality indices
- `VOLTAGE`, `CURRENT`, `POWER`, `BATTERY_LEVEL` - Power metrics

**Wire format:** `SignedReading` protobuf envelope (see P2P_Preparation.md section 2.2):

```protobuf
message SignedReading {
  bytes payload = 1;              // Serialized sensor reading (protobuf)
  bytes signature = 2;            // Ed25519 signature of payload
  string ingester_id = 3;         // Short ID derived from public key
  uint32 key_version = 4;         // Supports key rotation
}
```

## Node Registration in OrbitDB

Each infrastructure node (ingester, hub, router) registers itself in the `wesense.nodes` OrbitDB database. This is a unified registry — no separate databases for ingesters and hubs.

```json
{
  "_id": "wsi_a1b2c3d4",
  "public_key": "MCowBQYDK2VwAyEA...",
  "roles": ["ingester", "hub"],
  "regions": ["nz/auk", "nz/wgn"],
  "zenoh_mode": "peer",
  "zenoh_endpoint": "tcp/203.0.113.50:7447",
  "mqtt_endpoint": "mqtt://hub.example.com:1883",
  "sensor_count": 1250,
  "version": "1.2.0",
  "updated_at": "2026-02-10T14:30:00Z"
}
```

Consumers query their local OrbitDB replica to discover nodes by region, role, or capability. Queries are instant (local replica, no network round-trip).

**Discovery use cases:**

- Consumers find ingesters serving their region of interest
- Sensors/Meshtastic users find nearby MQTT hubs
- Mesh-mode peers find other peers for direct connections (network resilience fallback)
- Consumers verify ingester signatures against the `wesense.trust` database

## Trust Registration in OrbitDB

The `wesense.trust` database stores Ed25519 public keys for verified ingesters (see P2P_Preparation.md section 2.2):

```json
{
  "_id": "wsi_a1b2c3d4",
  "public_key": "MCowBQYDK2VwAyEA...",
  "key_version": 1,
  "operator": "wesense-earth",
  "status": "active",
  "verified_at": "2026-01-15T00:00:00Z"
}
```

Consumers verify `SignedReading` signatures against this trust list. Revoked keys are marked with `"status": "revoked"` and rejected immediately.
