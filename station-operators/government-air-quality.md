# Government Air Quality Ingesters

WeSense ingests data from government air quality monitoring networks. These are reference-grade instruments operated by environment agencies — the "golden source" for calibrating community sensors and providing authoritative context alongside WeSense data.

## Available Ingesters

| Profile | Ingester | Sources | Active Stations |
|---------|----------|---------|-----------------|
| `govaq-nz` | wesense-ingester-govaq-nz | ECan REST API + 7 Hilltop councils | ~55 |
| `govaq-au` | wesense-ingester-govaq-au | NSW, QLD, ACT (+ VIC, SA, TAS when verified) | ~165 |

More regional ingesters (UK, US, EU, Asia, Americas) are planned. See the [rollout design](https://github.com/wesense-earth/wesense-general-docs) for details.

## Enabling a Government AQ Ingester

Add the profile to `COMPOSE_PROFILES` in your `.env`:

```
COMPOSE_PROFILES=guardian,tls,govaq-au
```

Then bring up the stack as normal:

```bash
docker compose up -d
```

The ingester will start polling its data sources automatically.

## Configuring Sources (govaq-au)

The Australian ingester has 6 state/territory sources, each independently toggleable. Three are enabled by default (NSW, QLD, ACT). Three are disabled because they need an API key or have unverified endpoints (VIC, SA, TAS).

### Toggle sources via environment variables

Add these to your `.env` to override the defaults:

```bash
# These are the defaults — you only need to add lines you want to change
ENABLE_GOVAQ_AU_NSW=true
ENABLE_GOVAQ_AU_QLD=true
ENABLE_GOVAQ_AU_ACT=true
ENABLE_GOVAQ_AU_VIC=false    # Requires VIC_EPA_API_KEY
ENABLE_GOVAQ_AU_SA=false     # Endpoint unverified
ENABLE_GOVAQ_AU_TAS=false    # Endpoint unverified
```

To enable Victoria, register for a free API key at [portal.api.epa.vic.gov.au](https://portal.api.epa.vic.gov.au) and add:

```bash
ENABLE_GOVAQ_AU_VIC=true
VIC_EPA_API_KEY=your_key_here
```

### Toggle sources via config file

Alternatively, create a local config override. The docker-compose service mounts `./ingester-govaq-au/config/` into the container:

```bash
mkdir -p ingester-govaq-au/config
```

Copy and edit `sources.json` from the [repository](https://github.com/wesense-earth/wesense-ingester-govaq-au/blob/main/config/sources.json). Set `"enabled": true` or `false` per source.

Environment variables take precedence over the config file.

### Polling interval

The default poll interval is 15 minutes (900 seconds). Most government sources update hourly, so 15 minutes catches new data promptly without excessive requests. Override with:

```bash
GOVAQ_AU_POLL_INTERVAL=900
```

## Configuring Sources (govaq-nz)

The NZ ingester follows the same pattern. Sources are configured in `ingester-govaq-nz/config/sources.json` or via environment variables:

```bash
ENABLE_GOVAQ_NZ_ECAN=true
ENABLE_GOVAQ_NZ_TASMAN=true
# etc.
```

See the [repository](https://github.com/wesense-earth/wesense-ingester-govaq-nz) for the full source list.

## Data Source and Licence

Each reading from a government ingester carries:

- **`data_source`** — identifies the specific source, e.g. `govaq_au_nsw`, `govaq_nz_ecan`
- **`data_license`** — the licence under which the data is published, e.g. `CC-BY-4.0`, `OGL-3.0`, `open-no-explicit`

These fields are part of the signed canonical reading and travel identically via both the live MQTT path and the storage broker archive path (see [Ingester Architecture](/architecture/ingester-architecture) for details on the dual-path identity invariant).

## Why Government Stations Matter

Government stations use reference-grade instruments (BAM for PM, chemiluminescence for NOx, UV photometry for ozone) that are periodically audited and calibrated. They provide:

- **Cross-calibration** — compare WeSense community sensors against nearby reference stations to quantify and correct bias
- **Validation** — test whether swarm correction algorithms converge toward the reference value
- **Context** — show the authoritative reading alongside community data

Government stations are sparse but accurate. WeSense sensors are dense but lower accuracy. The two complement each other.
