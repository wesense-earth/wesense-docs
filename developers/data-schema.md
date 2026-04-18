# Data Schema Reference

A concentrated one-page reference for developers. Each section links to the authoritative architecture doc where the concern is discussed in depth.

---

## MQTT Topics

### Sensor → ingester (raw, per-source)

```
wesense/v2/wifi/{country}/{subdivision}/{device_id}          # WeSense ESP32 over WiFi, protobuf
wesense/v2/lora/{device_id}                                   # WeSense LoRa readings, protobuf
wesense/v2/lora/metadata/{device_id}                          # LoRa device metadata
```

Payload on the WiFi topic is the `SensorArrayReading` protobuf (multiple readings per message, one reading per chip). Full protobuf definition and Zenoh key expressions in [Topic Structure](../architecture/topic-structure.md).

### Ingester → network (decoded, per-source)

```
wesense/decoded/{source}/{country}/{subdivision}/{device_id}
```

Payload is a decoded JSON document, one per reading type. Subscribers include the map, archive workflows, and the live P2P transport. `{source}` is one of `wesense`, `meshtastic`, `homeassistant`, `govaq`, etc.

### Registries (OrbitDB)

The `wesense.nodes` and `wesense.trust` OrbitDB stores hold network identity and trust records. See [Topic Structure → Node/Trust Registration](../architecture/topic-structure.md#node-registration-in-orbitdb).

---

## ClickHouse — `sensor_readings` table

Primary analytical table. Canonical SQL lives in [`wesense-clickhouse-live/create_sensor_readings.sql`](https://github.com/wesense-earth/wesense-clickhouse-live/blob/main/create_sensor_readings.sql); migrations in the same repo's `migrations/` folder.

**Engine:** `ReplacingMergeTree(timestamp)` — most-recent version of each `(device_id, reading_type, timestamp)` key wins on merge.
**Partition:** `toYYYYMM(timestamp)` — one partition per month.
**Order:** `(device_id, reading_type, timestamp)`.
**TTL:** 3 years on `timestamp`.

### Key columns

| Column | Type | Notes |
|---|---|---|
| `timestamp` | `DateTime64(3, 'UTC')` | Sensor timestamp, millisecond precision |
| `device_id` | `String` | Unique per sensor, usually the MAC-derived ID |
| `data_source` | `LowCardinality(String)` | Lowercase source token (`wesense`, `meshtastic`, …) |
| `data_source_name` | `LowCardinality(String)` | Human-readable display name for the source |
| `network_source` | `LowCardinality(String)` | How the sensor is connected: `wifi`, `lora`, `meshtastic`, … |
| `ingestion_node_id` | `LowCardinality(String)` | Which station ingested this reading |
| `reading_type` | `LowCardinality(String)` | Canonical type token: `temperature`, `humidity`, `co2`, `pm2_5`, `voc`, `nox`, `pressure`, … |
| `reading_type_name` | `LowCardinality(String)` | Human-readable display name (e.g. `PM2.5` for `pm2_5`) |
| `value` | `Float64` | Reading value in canonical units |
| `unit` | `LowCardinality(String)` | Unit string (e.g. `°C`, `%`, `ppm`, `µg/m³`) |
| `sample_count` | `UInt16` | Samples aggregated into this reading |
| `sample_interval_avg` | `UInt16` | Average sample interval in seconds |
| `value_min`, `value_max` | `Float64` | Min/max across aggregated samples |
| `latitude`, `longitude` | `Float64` | WGS84, device-reported or geocoded |
| `altitude` | `Nullable(Float32)` | Metres above sea level when known |
| `geo_country` | `LowCardinality(String)` | ISO 3166-1 alpha-2 (lowercase): `nz`, `au`, `gb` |
| `geo_subdivision` | `LowCardinality(String)` | ISO 3166-2 (lowercase): `auk`, `wko`, `eng` |
| `geo_h3_res8` | `UInt64` | H3 index at resolution 8 for fast spatial queries |
| `sensor_model`, `board_model` | `LowCardinality(String)` | Hardware identifiers |
| `calibration_status` | `LowCardinality(String)` | `unknown`, `factory`, `user_calibrated`, … |
| `data_quality_flag` | `LowCardinality(String)` | Default `unvalidated`; see [Data Quality](../architecture/data-quality.md) |
| `deployment_type` | `LowCardinality(String)` | `indoor`, `outdoor`, `unknown` — classifier output |
| `deployment_type_source` | `LowCardinality(String)` | How `deployment_type` was determined |
| `transport_type` | `LowCardinality(String)` | `mqtt`, `lora`, `webhook`, … |
| `location_source` | `LowCardinality(String)` | How the lat/lon was established |
| `firmware_version` | `Nullable(String)` | Reporting firmware version |
| `deployment_location`, `node_name` | `Nullable(String)` | Owner-set labels |
| `node_info`, `node_info_url` | `Nullable(String)` | Optional owner metadata |
| `signature` | `String` | Ed25519 signature (hex) — see [Data Integrity](../architecture/data-integrity.md) |
| `public_key` | `LowCardinality(String)` | Ed25519 public key (base64), stored per row so archives are self-contained |
| `ingester_id` | `LowCardinality(String)` | Signing ingester identifier (`wsi_xxxxxxxx`) |
| `key_version` | `UInt32` | Signing key version |
| `signing_payload_version` | `UInt16` | Which version of the canonical signing schema was used |
| `received_via` | `LowCardinality(String)` | `local` if ingested here, `p2p` if synced from another station |
| `data_license` | `LowCardinality(String)` | SPDX identifier, default `CC-BY-4.0` — see [Data Licensing](../architecture/data-licensing.md) |

See [Storage & Archives](../architecture/storage-and-archives.md) for partitioning strategy, archive export, deduplication, and the 200-year aggregation roadmap.

---

## Reading ID

A content-based deduplication identifier used at the archive / IPFS layer. Same physical measurement always produces the same ID regardless of which station received it.

```python
reading_id = sha256(f"{device_id}|{sensor_timestamp}|{reading_type}|{value}").hexdigest()[:32]
```

Implementation: [`wesense-ingester-core/wesense_ingester/ids/reading_id.py`](https://github.com/wesense-earth/wesense-ingester-core/blob/main/wesense_ingester/ids/reading_id.py). Note `sensor_timestamp` is the sensor's timestamp in Unix seconds, not the receive time.

Reading IDs are used by archives (one Parquet row per reading ID) and by the P2P replication layer for deduplication; ClickHouse itself deduplicates via the `ReplacingMergeTree` on the `(device_id, reading_type, timestamp)` key.

---

## Geocoding

WeSense uses [ISO 3166](https://en.wikipedia.org/wiki/ISO_3166) for all location codes, lowercased throughout:

- `geo_country`: ISO 3166-1 alpha-2. Examples: `nz`, `au`, `gb`, `us`, `de`.
- `geo_subdivision`: ISO 3166-2 region code (without the country prefix). Examples: `auk` (Auckland, NZ-AUK), `wko` (Waikato, NZ-WKO), `eng` (England, GB-ENG).

The mapping table used by all ingesters lives in [`wesense-ingester-core/wesense_ingester/geocoding/iso3166.py`](https://github.com/wesense-earth/wesense-ingester-core/blob/main/wesense_ingester/geocoding/iso3166.py). Reverse geocoding from lat/lon uses GeoNames with an LRU cache.

---

## Parquet archive schema

Daily archives are exported as Parquet files keyed by content-addressed CID. Column layout mirrors `sensor_readings` with two additions:

- Each row is keyed by `reading_id` for deduplication across replicas.
- Compression is ZSTD (benchmarked as optimal — see Phase 5 roadmap).

Archives are partitioned by `(country, subdivision, date)`. Full scheme: [Storage & Archives → Long-Term Archival Strategy](../architecture/storage-and-archives.md#long-term-archival-strategy-200-year-horizon).

---

## Signing and trust

Every reading is signed with the ingester's Ed25519 key before leaving the station. The signature and the public key are stored per row so any archive is self-verifiable without external lookup. Trust semantics, key rotation, and revocation are covered in [Data Integrity](../architecture/data-integrity.md) and [Governance & Trust](../architecture/governance-and-trust.md).

---

## Related references

- **[Topic Structure](../architecture/topic-structure.md)** — full MQTT / Zenoh / OrbitDB message formats
- **[Storage & Archives](../architecture/storage-and-archives.md)** — ClickHouse engine choices, archive export, TTL tiering
- **[Data Integrity](../architecture/data-integrity.md)** — signing, verification, key lifecycle
- **[Data Quality](../architecture/data-quality.md)** — quality flag semantics
- **[Data Licensing](../architecture/data-licensing.md)** — license field and obligations
- **[Writing an Ingester](./writing-an-ingester.md)** — end-to-end developer guide for adding a new data source
- **Canonical ClickHouse SQL:** [`wesense-clickhouse-live`](https://github.com/wesense-earth/wesense-clickhouse-live)
