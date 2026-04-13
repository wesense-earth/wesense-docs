# Scale & Partitioning

The architecture is designed to handle massive scale while maintaining decentralization:

## Target Scale

- **1 million+ devices** worldwide
- **Each device**: 1 to 10+ sensor types
- **Each sensor node**: Multiple sensor types (temperature, humidity, CO2, PM2.5, etc.)
- **Each reading**: Multiple data fields (value, timestamp, location, calibration, etc.)
- **Update frequency**: Every 5-20 minutes per sensor

## Volume Calculation

Large scale example:

```
1M devices × 10 sensors × 1 reading per 5 min = 2M readings/minute
= ~33,000 readings/second
```

While manageable, a single global "firehose" is still impractical. The architecture uses **topic partitioning** so consumers only receive data they need.

## Partitioning Strategy

Data is partitioned by:

1. **Geographic region** (country/subdivision)

This allows a consumer viewing only New Zealand data to subscribe to ~0.1% of global traffic.

**Note:** The v2 protocol consolidates all readings into a single message per device. Some ingesters (e.g., Home Assistant) may publish separate messages per reading type but still use the same geographic topic structure. Reading type filtering is always performed client-side after receiving messages.

## Consumer Subscription Patterns

### Subdivision Map (Most Common)

```python
# Display sensors in Auckland only
session.declare_subscriber("wesense/v2/live/nz/auk/*", handle_message)
# Receives: all readings for Auckland (consolidated per device)
# * matches device_id level only
```

### Country-wide Map

```python
# Display all sensors in New Zealand
session.declare_subscriber("wesense/v2/live/nz/**", handle_message)
# Receives: all readings from all NZ subdivisions and devices
# ** matches all remaining levels
```

### Multi-Region View

```python
# Trans-Tasman view
session.declare_subscriber("wesense/v2/live/nz/**", handle_message)       # All of NZ
session.declare_subscriber("wesense/v2/live/au/qld/*", handle_message)    # Queensland devices
session.declare_subscriber("wesense/v2/live/au/nsw/*", handle_message)    # NSW devices
```

### Global Choropleth (Distributed Query)

```python
# Query all ingesters for country-level aggregates (no subscription needed)
replies = session.get("wesense/v2/live/**", value="summary")
for reply in replies:
    # Each ingester responds with its regional aggregate
    aggregate = deserialize(reply.ok.payload)
    render_choropleth(aggregate)
```

### Full Firehose (Not Recommended for End Users)

```python
# Research/archival node only
session.declare_subscriber("wesense/v2/live/**", handle_message)
# Warning: High bandwidth at scale
```

**Note:** With v2 format, filtering by specific reading type is done client-side after receiving consolidated messages. Zenoh wildcard key expressions handle geographic filtering natively.
