# Why Durability Over Accuracy

Most sensor guides and community projects focus on accuracy — how close a reading is to a reference instrument at the moment of calibration. WeSense takes a different approach: we prioritise **long-term stability and low maintenance** over initial accuracy.

This is a deliberate design choice, and it's one that many people will instinctively push back on. This page explains why, with evidence.

## The Problem with Accuracy-First

<!-- TODO: Expand with specific examples and data -->

### Calibration Degrades

A sensor calibrated to laboratory accuracy today will drift. The question is not *if* but *how fast* and *how much*. For a permanent, unattended sensor network:

- Most people will never recalibrate their sensors
- Any design that requires periodic calibration will fail at scale
- An "accurate" sensor that drifts unchecked gives worse data than a stable sensor that was never calibrated

### The Painful Calibration Cycle

Many community sensor projects recommend regular recalibration against reference instruments. In practice:

- Reference instruments are expensive and not widely available
- The process is time-consuming and requires technical knowledge
- Compliance drops rapidly after the first few months
- The network degrades as uncalibrated sensors contribute drifting data

## Why Stability Wins

### Emergent Accuracy

A network of thousands of slightly imprecise but **stable** sensors achieves **emergent accuracy** — the statistical aggregate is more accurate than any individual sensor. This only works when sensors are consistent over time.

### Government Stations Provide the Baseline

Government reference-grade monitoring stations (which WeSense also ingests) provide the accuracy baseline. Community sensors provide the **density**. You don't need every sensor to be reference-grade when you have reference stations for cross-validation.

### What We Look for in a Sensor

| Property | Priority | Why |
|----------|----------|-----|
| Long-term stability (low drift) | Critical | Data quality over years, not moments |
| Lifespan | High | Sensors should last 3-5+ years without replacement |
| Maintenance requirements | High | Must be zero or near-zero |
| Power efficiency | Medium | Enables solar/battery deployments |
| Initial accuracy | Lower | Correctable via cross-calibration with reference stations |
| Cost | Medium | Lower cost enables denser networks |

## Evidence

<!-- TODO: Add specific sensor comparisons -->
<!-- TODO: Reference papers on emergent accuracy in sensor networks -->
<!-- TODO: Real-world examples of drift in popular sensors (SDS011, BME280, SCD40, etc.) -->
<!-- TODO: Data from WeSense's own network showing cross-sensor consistency -->

## Further Reading

<!-- TODO: Links to relevant research papers and articles -->
