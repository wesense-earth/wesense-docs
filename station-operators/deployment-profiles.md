# Deployment Profiles

WeSense uses Docker Compose profiles to let you run exactly the components you need. Choose the profile that matches the role you want your host to play.

## Main Profiles

| Profile | What It Runs | Who It's For |
|---------|-------------|--------------|
| `contributor` | Ingesters only | Anyone with sensors — sends data to a remote hub |
| `guardian` | EMQX + ClickHouse + Ingesters + Respiro + P2P + OrbitDB | The full stack. Stores, serves, and replicates data for a region. The most valuable station type for the network. |
| `hub` | EMQX broker + OrbitDB | Operates a public MQTT entry point for sensors in a region |
| `bootstrap` | OrbitDB only | A publicly-reachable P2P peer that helps new stations find existing ones. A lightweight side role. |
| `observer` | ClickHouse + Respiro (receive-only) | Read-only map / data viewer; receives data via P2P from guardians |

## Add-on Profiles

| Add-on | What It Adds |
|--------|-------------|
| `tls` | TLS encryption for MQTT and internal services |
| `downlink` | Enables sensor command channel |
| `govaq-nz` | New Zealand government air quality ingester |

Profiles can be combined — set `COMPOSE_PROFILES=guardian,tls,govaq-nz` to get a guardian station with TLS encryption and the NZ govt air quality ingester.

## How profiles relate to each other

The profiles are not disjoint: they share components. `guardian` and `hub` both include OrbitDB (the P2P peer-discovery and trust-sync service). `bootstrap` runs *just* that OrbitDB component with nothing else.

This means:

- **If you run a `guardian` or `hub` profile with a public `ANNOUNCE_ADDRESS`, you are functionally a bootstrap too** — other stations can be told to discover the network via you. The `bootstrap` profile is just a *minimal* deployment for hosts that should do only that one job (typically a small VPS dedicated to being a public rendezvous point).
- **Becoming an advertised bootstrap** means setting `ANNOUNCE_ADDRESS` to a public hostname *and* having other stations include your hostname in their `ORBITDB_BOOTSTRAP_PEERS` list. Both sides of this are needed.
- **The `bootstrap` role is optional for the network as a whole.** Stations can discover each other without one (via mDNS on a LAN, or the P2P DHT). A well-known bootstrap just makes initial peer discovery faster, especially across the internet. See [Run a Bootstrap Node](/station-operators/run-a-bootstrap) for when and how to run one.

## Which Should I Choose?

- **Got sensors and want to contribute data, don't want to run servers?** → `contributor`. Sends to the public hub.
- **Want to run the full stack, store data, help preserve the commons?** → `guardian`. This is the most impactful role.
- **Want to run a public MQTT entry point for your region?** → `hub`.
- **Want to help the P2P network's peer discovery without running the full stack?** → `bootstrap`. Small, lightweight, needs a public address.
- **Just want to view the map / query data locally?** → `observer`.

See [Operate a Station](/station-operators/operate-a-station) for setup.
