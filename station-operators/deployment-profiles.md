# Deployment Profiles

WeSense uses Docker Compose profiles to let you run exactly the components you need. Choose the profile that matches your role.

## Profiles

| Profile | What It Runs | Who It's For |
|---------|-------------|--------------|
| `contributor` | Ingesters only | Anyone with sensors — sends data to a remote hub |
| `guardian` | EMQX + ClickHouse + Ingesters + Respiro + P2P | Home labbers wanting the full stack with data preservation |
| `hub` | EMQX only | Production MQTT broker operators |

## Add-on Profiles

| Add-on | What It Adds |
|--------|-------------|
| `tls` | TLS encryption for MQTT and internal services |
| `downlink` | Enables sensor command channel |
| `govaq-nz` | New Zealand government air quality ingester |

## Which Should I Choose?

<!-- TODO: Decision flowchart -->
