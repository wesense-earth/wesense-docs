# Monitoring & Observability

## Health Endpoints

Every service exposes a health endpoint for Docker healthchecks and operational monitoring:

| Service | Endpoint | What it Reports |
|---|---|---|
| Storage Broker | `GET /health` | Basic liveness |
| Storage Broker | `GET /status` | Pipeline stats (readings processed, duplicates, errors), archive scheduler status |
| OrbitDB | `GET /health` | Peer count, WeSense peer count, database sizes, GossipSub topic subscriptions |
| OrbitDB | `GET /health/debug` | (localhost only) Gossip internal state, stream diagnostics, protocol negotiation |
| Zenoh API | `GET /health` | Zenoh session status (200 if connected, 503 if degraded) |
| EMQX | `emqx ctl status` | Broker running status |
| ClickHouse | `SELECT 1` | Database accepting queries |

## Key Metrics

**For station operators:**

- Readings per minute by data source — is each ingester producing data?
- Last reading timestamp per data source — has anything gone silent?
- ClickHouse disk usage — approaching capacity?
- P2P peer count — connected to the network?
- Archive count and replication status — are archives being produced and synced?

**For the network:**

- Total stations registered in OrbitDB
- Archive blob count across the network (currently 98K+)
- Replication completeness between peers

## Logging

All Python services use `wesense-ingester-core`'s `setup_logging()`:

- **Console:** Coloured output (cyan=INFO, yellow=WARN, red=ERROR)
- **File:** Rotating logs in `/app/logs/` (10 MB, 5 rotations)
- **Level:** Configurable via `LOG_LEVEL` env var

Node.js services (OrbitDB, Respiro) use standard console logging with structured output.

<!-- TODO: Centralised log aggregation. Currently logs are per-container and require `docker logs` or volume mounts to access. A future improvement would be shipping logs to a local Loki or similar for cross-service correlation. Not urgent while stations are operator-managed. -->

<!-- TODO: Automated alerting. Currently monitoring is manual (check health endpoints, watch logs). Alerting when ingesters stop, when disk fills, when P2P peers drop to zero, or when archive replication stalls would catch issues before they become data loss. -->
