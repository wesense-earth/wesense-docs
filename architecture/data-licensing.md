# Data Licensing

## Code License

All WeSense software is licensed under **AGPL-3.0** (GNU Affero General Public License v3). This means:

- Anyone can use, modify, and redistribute the code
- Modified versions must also be open source under AGPL-3.0
- Network use (running the software as a service) triggers the same sharing requirement
- This prevents proprietary forks that benefit from the community's work without contributing back

## Data License

WeSense-originated data (readings from WeSense sensors, Meshtastic devices ingested by WeSense, and other community-contributed sensor data) is released under **CC-BY 4.0** (Creative Commons Attribution 4.0 International). This means:

- Anyone can use, share, and adapt the data for any purpose, including commercial use
- The only requirement is attribution: credit WeSense as the data source
- No additional restrictions can be imposed on the data by downstream users

Attribution keeps the project visible — every research paper, government report, or dashboard using WeSense data credits the network that produced it. This helps the project grow and sustains the community that maintains it.

**Where the license will be declared (planned):**

1. In the archive manifest — so every Parquet archive is self-documenting
2. On the website and docs (done — this page)
3. In a `data_license` field per reading (not yet implemented — see Upstream Source Licensing below)

## Upstream Source Licensing

Not all data in WeSense originates from WeSense sensors. Government air quality data, donated research datasets, and other external sources may carry their own license terms. The WeSense CC-BY 4.0 license applies only to data that WeSense is authorised to release under those terms — it cannot override upstream restrictions.

To handle this, the architecture supports per-source license tracking:

| Data Source | Typical License | Notes |
|---|---|---|
| WeSense sensors | CC-BY 4.0 | Community-contributed, WeSense controls the terms |
| Meshtastic (community) | CC-BY 4.0 | Community-contributed via public mesh network |
| NZ government (ECan, Hilltop councils) | NZGOAL (CC-BY 4.0 compatible) | NZ Government Open Access and Licensing framework |
| Donated research datasets | Varies | Must be declared at import time |
| Commercial weather networks | Varies | May restrict redistribution — check before ingesting |

<!-- TODO: Add a `data_license` field to the reading schema (LowCardinality String). Ingesters set this based on their source's known license. The storage broker includes it in Parquet archives. Default: "CC-BY-4.0" for WeSense-originated data. This enables consumers to filter by license if they need to (e.g., a researcher who can only use CC0 or public domain data). -->

**Rule for new ingesters:** Before writing an ingester for an external data source, verify the source's license permits redistribution. If it does, document the license in the ingester's README and set `data_license` appropriately. If it doesn't, the data cannot be ingested into WeSense.

## Donated and Historical Data

WeSense welcomes donations of historical environmental datasets. Researchers, universities, government agencies, and citizen science projects may have valuable data — years or decades of readings — that would benefit from permanent, open, distributed storage.

**Why donate data to WeSense:**

- **Permanence** — WeSense archives are content-addressed and replicated across a P2P network. Data survives independently of any single institution, server, or funding cycle. A research grant ends, a university server is decommissioned, a government department restructures — the data persists.
- **Accessibility** — Donated data becomes queryable alongside live sensor data. A researcher studying 20-year PM2.5 trends can combine historical donated data with current WeSense readings in a single query.
- **Verifiability** — Every reading is signed and archived with a trust snapshot. The provenance chain records who donated the data, when, and under what license.
- **Discoverability** — Data in WeSense appears on the map, in the archives, and in the P2P network. It's findable by anyone, not buried on a department file server.

**What makes a good donation:**

- Environmental sensor readings with geographic coordinates and timestamps
- Any temporal resolution — 1-second, 5-minute, hourly, daily
- Any spatial coverage — a single station or a national network
- Documented sensor types and units (or enough metadata to reconstruct them)
- A license that permits redistribution (or willingness to release under CC-BY 4.0)

**How donation works:**

Donated data flows through the same pipeline as live data — an import ingester reads the historical dataset (CSV, Parquet, database export, API), converts it to standard WeSense reading dicts, and posts to the storage broker. The import ingester signs the readings with its own Ed25519 key, attesting "I ingested this from source X." The `data_source` field identifies the origin; `sensor_transport` is set to `import`.

<!-- TODO: Build a general-purpose import ingester that accepts CSV/Parquet files with configurable column mapping. This would lower the barrier for data donations — a researcher shouldn't need to write Python to contribute a dataset. The ingester would:
  1. Read the input file
  2. Map columns to WeSense standard fields via a config file
  3. Validate and geocode
  4. Sign and POST to the storage broker
  5. Record the donation metadata (source, license, contact, date range, description)

This is distinct from a live ingester — it runs once (or on a schedule for ongoing exports) rather than continuously. -->

The vision is that WeSense becomes a natural home for environmental data that might otherwise be lost when the project that collected it ends. Every dataset donated strengthens the network's value and moves closer to a comprehensive, permanent, open record of Earth's environment.
