# Data Quality

## Validation Pipeline

Readings pass through multiple validation stages:

| Stage | What it Catches | Action |
|---|---|---|
| **Pydantic model** (storage broker) | Missing required fields, wrong types | Reject with 422 |
| **Geocoding check** (storage broker) | Missing `geo_country` / `geo_subdivision` | Reject (counter incremented) |
| **Deduplication** (ingester + ClickHouse) | Duplicate readings from mesh flooding or multi-path delivery | Skip silently |
| **Content-based ID** (ClickHouse `ReplacingMergeTree`) | Same reading ingested by multiple stations | Last-write-wins dedup at query time with `FINAL` |

## Known Data Quality Challenges

**Sensor drift:** Sensors degrade over time. A PM2.5 sensor may read 20% high after a year of outdoor exposure. WeSense stores `calibration_status` per reading (from the sensor firmware) and `sensor_model` to enable post-hoc correction by researchers, but does not currently apply corrections in the pipeline.

**Stuck sensors:** A sensor reporting the same value indefinitely (e.g., 0°C for a week) is likely malfunctioning. Currently not detected automatically.

**GPS glitches:** A sensor reporting coordinates in the ocean or on the wrong continent. The geocoder will assign a country/subdivision, but the result will be wrong. Currently not detected automatically.

**Bad actors:** A malicious ingester could sign and submit fabricated readings. The Ed25519 trust model means every reading is traceable to its signing ingester. Revoking an ingester's key in the trust list allows consumers to exclude all its readings retroactively — including from already-archived Parquet files (the trust snapshot records revocation status).

## Data Quality Flags

The ClickHouse schema includes a `data_quality_flag` column (`LowCardinality(String)`, default `'unvalidated'`). This supports future automated quality assessment without modifying readings — the flag is metadata about the reading, not part of the reading itself.

<!-- TODO: Implement automated data quality checks. Candidates:
  - Stuck sensor detection: flag readings where value hasn't changed in N hours
  - Range validation: flag readings outside physically plausible bounds (e.g., temperature > 60°C, PM2.5 > 1000 µg/m³)
  - Spatial outlier detection: flag readings that differ significantly from nearby sensors
  - Temporal outlier detection: flag sudden jumps that don't correlate with weather events
  These should write to data_quality_flag, not drop readings — bad data is still data, and the flag enables researchers to decide what to include. -->
