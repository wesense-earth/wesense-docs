# Data Schema Reference

## Reading Types

<!-- TODO: Complete list of reading_type values, units, and descriptions -->

## MQTT Topic Structure

```
wesense/v2/wifi/{country}/{subdivision}/{device_id}        # Raw WiFi sensor data
wesense/v2/lora/{device_id}                                 # Raw LoRa readings
wesense/decoded/{source}/{country}/{subdivision}/{device_id} # Decoded output
```

## ClickHouse Schema

<!-- TODO: sensor_readings table structure, key columns, TTL -->

## Geocoding

All locations use ISO 3166-1 alpha-2 (countries) and ISO 3166-2 (subdivisions).

<!-- TODO: Examples, edge cases -->

## Reading IDs

Each reading gets a SHA-256 content-based hash for deduplication and IPFS addressing.

<!-- TODO: How the hash is computed, what fields are included -->
