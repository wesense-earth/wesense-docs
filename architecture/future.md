# Future Considerations

## Additional Topic Dimensions

The current structure (`/wesense/v2/live/{country}/{subdivision}/{device_id}`) already provides good granularity. Future extensions might include:

- ~~Indoor/outdoor classification in payload metadata~~ — Done: `deployment_type` field in readings, P2P classification sharing via iroh blob (see 4b.5)
- Sensor quality tiers for data confidence levels

## Quality of Service

- Implement message priorities for critical readings (e.g., hazardous air quality)
- Add subscription rate limiting for fairness

## Cross-Region Queries

- Enable consumers to query specific ingesters directly via ClickHouse HTTP API
- Useful for historical analysis without downloading full archives

## Scaling to Billions of Sensors

The current architecture targets millions of sensors. Scaling to billions would require architectural evolution:

### Deeper Geographic Partitioning

Add H3 hexagonal cell indexing for sub-subdivision granularity:

```
wesense/v2/{country}/{subdivision}/{h3_res4}/{device_id}
```

This creates ~40,000 geographic partitions (vs ~4,000 subdivisions), allowing neighbourhood-level subscriptions.

### Hierarchical Aggregation

Pre-compute aggregates at multiple levels to avoid raw data downloads. Note: Never use daily averages as they destroy time-of-day signal critical for environmental analysis (see Section 5.4).

| Level       | Granularity                  | Use Case          |
| ----------- | ---------------------------- | ----------------- |
| Device      | 5-min readings               | Detailed analysis |
| H3 cell     | Hourly (rich stats)          | Local monitoring  |
| Subdivision | 6-hourly (rich stats)        | Regional trends   |
| Country     | 6-hourly (rich stats, older) | Policy & research |

"Rich stats" means preserving distribution (count, mean, min, max, stddev, percentiles) not just averages. Consumers query the appropriate level - no one downloads all raw readings for a country.

### Federated Query Model

Already available via Zenoh Queryables (not a future requirement):

```
Consumer → Zenoh query on wesense/v2/live/** → Multiple ingesters respond → Aggregated response
```

Each ingester responds with its data subset. This is native Zenoh functionality, available from day one.

### Probabilistic Discovery

Use Bloom filters in OrbitDB to answer "does this region have data for sensor type X?" without downloading full indexes. Reduces discovery overhead from O(n) to O(1).

### Sparse Subscription Profiles

Consumers declare interest profiles:

```json
{
  "regions": ["nz/*", "au/nsw"],
  "reading_types": ["pm2_5", "co2"],
  "min_resolution": "hourly"
}
```

The network only routes matching data, reducing bandwidth by orders of magnitude.

### Tiered Storage

- **Hot**: Last 24h in ClickHouse (fast queries)
- **Warm**: Last 90 days in compressed Parquet on local disk
- **Cold**: Historical in highly compressed columnar format in the distributed archive (via storage broker)

### Edge Intelligence

Hubs perform anomaly detection, filtering, and compression so only significant data propagates globally. Stable readings are summarised; anomalies are forwarded in full detail.

### Architecture Evolution Summary

| Aspect         | Current (Millions)  | Future (Billions)        |
| -------------- | ------------------- | ------------------------ |
| Partitioning   | Country/Subdivision | + H3 cells               |
| Consumer model | Sync all archives   | Federated queries        |
| Aggregation    | Device + Daily      | Multi-level hierarchy    |
| Discovery      | Full OrbitDB sync   | Probabilistic indexes    |
| Storage        | Full replication    | Selective + tiered       |
| Data routing   | All data to all     | Interest-based filtering |

The key insight: the current "replicate everything locally" model works for millions but not billions. The evolution toward **federated queries** means consumers ask questions and the network returns answers, rather than downloading all data first.
