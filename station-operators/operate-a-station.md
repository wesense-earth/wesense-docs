# Operate a Station

Running a WeSense station is one of the most impactful contributions you can make. Your station stores sensor data, archives it in open Parquet format, and replicates archives across the P2P network — making the data resilient and permanent.

<!-- IMAGE: /images/stations/station-setup.jpg — Photo of a running WeSense station (Pi/server with SSD) -->
<!-- IMAGE: /images/diagrams/station-architecture.svg — Box diagram showing Docker services: EMQX → Ingesters → ClickHouse → Respiro, with Iroh/Zenoh/OrbitDB -->

::: info Pre-alpha Software
WeSense is under heavy development. Running a station currently requires comfort with Docker, command-line tools, and troubleshooting. We're working on making this easier.
:::

## What You Need

### Hardware

Any Linux system that can run Docker:

| Platform | Notes |
|----------|-------|
| **Raspberry Pi 4/5** (4GB+ RAM) | Good starter station. Use an SSD, not an SD card — ClickHouse will destroy SD cards. |
| **Home server / old PC** | x86_64, 4GB+ RAM. Best option for a full guardian. |
| **TrueNAS** | Works well. Set `PUID=568` and `PGID=568` in `.env`. |
| **VPS** | Good for bootstrap or hub profiles. Guardian on VPS works but needs adequate storage. |

### Software

- **Docker** and **Docker Compose** (v2+)
- **Git** (to clone the repository)

### Network

- Internet connection (for P2P replication and MQTT)
- For P2P connectivity, you'll need to either:
  - Have a public IP and forward ports 4002/TCP, 4401/UDP, 7447/TCP
  - Or be on the same LAN as another station that has public access

## Quick Start

```bash
# Clone the repository
git clone https://github.com/wesense-earth/wesense.git
cd wesense

# Create your configuration
cp .env.sample .env
nano .env    # Edit with your settings (see below)

# Start the station
docker compose pull
docker compose --profile guardian up -d

# Check it's running
docker compose ps
```

Access the Respiro dashboard at `http://<your-server-ip>:3001`.

## Configuration (.env)

The `.env` file controls everything. At minimum, you need to set:

### Profiles

```bash
# Which services to run
COMPOSE_PROFILES=guardian,wesense,meshtastic

# Guardian storage scope — what data to replicate
GUARDIAN_SCOPE=*/*           # Everything (world node)
# GUARDIAN_SCOPE=nz/*        # Just New Zealand (country node)
# GUARDIAN_SCOPE=nz/wgn      # Just Wellington (regional node)
```

See [Deployment Profiles](/station-operators/deployment-profiles) for all available profiles and what each runs.

### Passwords (required — startup blocked if defaults are left)

```bash
CLICKHOUSE_ADMIN_PASSWORD=<strong password>    # ClickHouse admin (internal only)
CLICKHOUSE_PASSWORD=<strong password>          # ClickHouse app user (ingesters/Respiro)
EMQX_DASHBOARD_PASSWORD=<strong password>      # EMQX web dashboard
```

The `config-check` service validates these on startup and will block all other services from starting if any password is left as the default `CHANGEME`.

### Identity

```bash
PUID=1000                    # Your user ID (run 'id' to check)
PGID=1000                    # Your group ID
TZ=Pacific/Auckland          # Your timezone
```

### Network / P2P

```bash
# If you have a public IP:
ANNOUNCE_ADDRESS=203.0.113.1

# If behind NAT with another station on your LAN:
# WESENSE_PROXY=192.168.1.100
```

### Ports

```bash
PORT_MQTT=1883               # MQTT (plain)
PORT_MQTT_TLS=8883           # MQTTS (encrypted)
PORT_RESPIRO=3001            # Respiro web dashboard
PORT_ZENOH=7447              # Zenoh P2P live data
PORT_IROH_QUIC=4401          # Iroh archive replication
PORT_ORBITDB_P2P=4002        # OrbitDB P2P discovery
```

### MQTT Authentication (optional)

```bash
MQTT_USER=mqttuser
MQTT_PASSWORD=               # Leave empty for anonymous (fine for LAN)
```

### Data Directory

```bash
DATA_DIR=./data              # Where all persistent data is stored
```

For production, use an absolute path on an SSD. For TrueNAS/ZFS, see the [ZFS tuning notes](#zfs-storage-tuning) below.

## What Runs in Each Profile

| Service | guardian | contributor | hub | bootstrap |
|---------|:--------:|:-----------:|:---:|:---------:|
| config-check | yes | yes | yes | yes |
| EMQX (MQTT broker) | yes | — | yes | — |
| ClickHouse | yes | — | — | — |
| Storage Broker | yes | yes | — | — |
| Archive Replicator | yes | yes | — | — |
| Respiro (map) | yes | — | — | — |
| Deployment Classifier | yes | — | — | — |
| Zenoh (live P2P) | yes | — | — | — |
| OrbitDB (discovery) | yes | — | yes | yes |

**Add-on profiles** (combine with a base profile):

| Add-on | What It Adds |
|--------|-------------|
| `tls` | Let's Encrypt certificates for MQTT encryption |
| `wesense` | WeSense ESP32 sensor ingester |
| `meshtastic` | Meshtastic community gateway ingester |
| `meshtastic-downlink` | Public Meshtastic MQTT ingester (worldwide, high traffic) |
| `homeassistant` | Home Assistant ingester |
| `govaq-nz` | NZ government air quality stations |

Example: a full guardian with WeSense and Meshtastic ingesters:
```bash
COMPOSE_PROFILES=guardian,wesense,meshtastic
```

## Verify Your Station

### Check Services

```bash
# All services should show "running"
docker compose ps

# Watch logs for errors
docker compose logs -f

# Resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"
```

### Check P2P Connectivity

```bash
# Archive replicator status (replication stats, blob counts)
curl -s http://localhost:4400/status | python3 -m json.tool

# OrbitDB health (peer discovery)
curl -s http://localhost:5200/health | python3 -m json.tool
```

### Access the Dashboard

Open `http://<your-server-ip>:3001` to see the Respiro map. If data is flowing, you should see sensor markers appearing.

### EMQX Dashboard

The EMQX MQTT broker has its own dashboard at `http://<your-server-ip>:18083`. Log in with username `admin` and the password from `EMQX_DASHBOARD_PASSWORD`. This shows connected clients, message rates, and broker health.

## Firewall / Port Forwarding

If your station needs to be reachable from the internet (for P2P replication with other stations):

### Linux Firewall (UFW)

```bash
sudo ufw allow 22/tcp       # SSH
sudo ufw allow 4002/tcp     # OrbitDB (P2P discovery)
sudo ufw allow 4401/udp     # Iroh (archive replication)
sudo ufw allow 7447/tcp     # Zenoh (live P2P)
sudo ufw allow 3001/tcp     # Respiro (optional, if you want remote access)
sudo ufw enable
```

### Home Router

Port-forward these from your router to your station's LAN IP:
- 4002/TCP — OrbitDB
- 4401/UDP — Iroh
- 7447/TCP — Zenoh

## TLS / Encrypted MQTT

For internet-facing stations, enable TLS so sensor data is encrypted in transit.

### Let's Encrypt (recommended for public-facing)

Requires a domain name and Cloudflare DNS.

```bash
# In .env:
COMPOSE_PROFILES=guardian,wesense,meshtastic,tls
TLS_MQTT_ENABLED=true
TLS_DOMAIN=mqtt.yourdomain.com
CLOUDFLARE_API_TOKEN=<your-cloudflare-token>
CERTBOT_EMAIL=you@example.com
```

Certificates are renewed automatically. ESP32 sensors include the ISRG Root X1 CA certificate, so they verify Let's Encrypt certificates without any additional configuration.

### Self-Signed (LAN only)

```bash
# Generate certificates
./scripts/generate-certs.sh

# In .env:
TLS_MQTT_ENABLED=true
```

Sensors connecting to a self-signed broker need the CA cert replaced in `ca_cert.h` and reflashed once. The self-signed CA is valid for 10 years.

## ZFS Storage Tuning

If running on TrueNAS or ZFS:

```bash
# Create a tuned dataset for ClickHouse
zfs create pool/wesense/clickhouse
zfs set recordsize=64K pool/wesense/clickhouse   # Match ClickHouse block size
zfs set dedup=off pool/wesense/clickhouse         # Critical — dedup wastes RAM here
zfs set atime=off pool/wesense/clickhouse
```

Set `CLICKHOUSE_DATA_DIR` in `.env` to point to this dataset.

## Updating Your Station

```bash
cd wesense
git pull
docker compose pull
docker compose --profile guardian up -d
```

This pulls the latest container images and restarts services. Data is preserved in the `DATA_DIR`.

## Common Issues

### Config-check blocks startup
All passwords in `.env` must be changed from the default `CHANGEME`. Check `CLICKHOUSE_ADMIN_PASSWORD`, `CLICKHOUSE_PASSWORD`, and `EMQX_DASHBOARD_PASSWORD`.

### ClickHouse won't start
Check disk space and permissions. If using ZFS, ensure `dedup=off`. If migrating from an older version with `CLICKHOUSE_USER=default`, see the migration section in the [wesense repository README](https://github.com/wesense-earth/wesense).

### P2P not connecting
Verify firewall ports are open and port forwarding is configured. Check `ANNOUNCE_ADDRESS` is set to your public IP. Use `curl localhost:4400/status` to check replication status.

### Container permissions
Ensure `PUID` and `PGID` in `.env` match the user running Docker. TrueNAS uses `568:568`. Run `id` to check your user's UID/GID.
