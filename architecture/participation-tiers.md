# Participation Tiers

## Tier 1: Simple Contributor

- **Who:** A user who just wants to get their sensor's data into the network.
- **Responsibilities:**
  1. Run a sensor.
  2. Configure the sensor to point to a Public Ingestion Node.
  3. Set the correct country and subdivision codes in sensor firmware (ISO 3166).
- **Required Infrastructure:** Only the sensor itself. No local ClickHouse, no Iroh, no storage. Their contribution is the data itself — they forward sensor data to a remote hub and can't pin archives. See Phase2Plan.md Section 14.2.1.

**Sensor Configuration:**

```cpp
// ISO 3166 Geographic Configuration
#define COUNTRY_CODE "nz"           // ISO 3166-1 alpha-2
#define SUBDIVISION_CODE "auk"      // ISO 3166-2 subdivision
#define DEVICE_LOCATION "office"    // User-defined location name

// Publishes to: wesense/v2/nz/auk/office_301274c0e8fc (all readings in one message)
```

## Tier 2: Producer / Public Ingestion Node (Station)

- **Who:** An advanced user or community member willing to run infrastructure for themselves and others.
- **Responsibilities:**
  1. Run a full "Ingester Stack": EMQX, ClickHouse, ingesters, OrbitDB, and Zenoh.
  2. Accept data from their own sensors and from Simple Contributors.
  3. Sign and broadcast readings to Zenoh key expressions.
  4. Register as a Queryable for the regions they serve.
  5. Register node in OrbitDB (`wesense.nodes`).
  6. Optionally: run as `guardian` persona — archive signed readings to archive replicator, replicate archives for their region.

> **Steward concept:** A station that also pins its local subdivision's archive data is a "steward" — more than a contributor, less than a guardian. Stations already have the disk space and uptime. Adding lightweight pinning (pull and store Parquet files for your own subdivision) is a natural extension. See Phase2Plan.md Section 14.2.1 for the full persona pinning model.

**Producer Configuration:**

```env
# .env configuration
ZENOH_MODE=peer                    # Or client if behind NAT
ZENOH_LISTEN=tcp/0.0.0.0:7447     # Only if peer mode
ZENOH_ROUTERS=tcp/router1.wesense.earth:7447,tcp/router2.wesense.earth:7447
```

**Two network modes (see P2P_Preparation.md section 2.3):**

- **Client mode (default):** Connects outbound to routers. Works behind any NAT. Zero config.
- **Mesh mode (opt-in):** Opens port 7447, accepts direct peer connections. Meshtastic-like discovery.

## Tier 3: Consumer / User

- **Who:** Anyone who wants to view or analyze the community's data.
- **Responsibilities:**
  1. Run the "Wesense Respiro" application.
  2. Subscribe to Zenoh key expressions for regions of interest.
- **Required Infrastructure:** A personal computer capable of running the map application and storing a local copy of the data.

**Consumer Subscription Example:**

```python
# Subscribe to Auckland and all of Australia via Zenoh
import zenoh

session = zenoh.open(zenoh.Config())

# Wildcard subscriptions - native Zenoh functionality
session.declare_subscriber("wesense/v2/live/nz/auk/*", handle_message)   # Auckland devices
session.declare_subscriber("wesense/v2/live/au/**", handle_message)      # All of Australia

# Distributed query for current state
replies = session.get("wesense/v2/live/nz/**", value="summary")
for reply in replies:
    print(reply.ok.payload)  # Regional aggregate from NZ ingesters
```
