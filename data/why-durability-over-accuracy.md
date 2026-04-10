# Why Durability Over Accuracy

Most sensor guides and community projects focus on accuracy — how close a reading is to a reference instrument at the moment of calibration. WeSense takes a different approach: we prioritise **long-term stability and low maintenance** over initial accuracy.

This is a deliberate design choice, and some people may instinctively push back on it. This page explains why.

## The Problem with Accuracy-First

### Calibration Degrades

A sensor calibrated to laboratory accuracy today will drift. The question is not *if* but *how fast* and *how much*. For a permanent, unattended sensor network:

- Most people will never recalibrate their sensors
- Any design that requires periodic calibration will fail at scale
- An "accurate" sensor that drifts unchecked gives worse data than a stable sensor that was never calibrated

The contrast is stark. The [Sensirion SHT4x datasheet](https://sensirion.com/media/documents/33FD6951/67EB9032/HT_DS_Datasheet_SHT4x_5.pdf) specifies humidity drift of less than 0.25 %RH/year and temperature drift of less than 0.03 °C/year — essentially negligible over a 5-year deployment. Compare that to budget sensors like the AHT20, which don't publish long-term drift specifications at all — a telling omission.

For CO2, the [Sensirion SCD30](https://sensirion.com/media/documents/4EAF6AF8/61652C3C/Sensirion_CO2_Sensors_SCD30_Datasheet.pdf) uses dual-channel NDIR technology that provides hardware-level drift compensation, making it inherently stable without user intervention. Single-channel sensors like the MH-Z19B and CM1106-C rely entirely on ABC (Automatic Baseline Correction) algorithms that assume regular exposure to fresh outdoor air — an assumption that fails in 24/7 indoor spaces like bedrooms or offices.

### The Painful Calibration Cycle

Many community sensor projects recommend regular recalibration against reference instruments. In practice:

- Reference instruments are expensive and not widely available
- The process is time-consuming and requires technical knowledge
- Compliance drops rapidly after the first few months
- The network degrades as uncalibrated sensors contribute drifting data

### What Drift Looks Like in the Real World

A [320-day field evaluation of Plantower PMS5003 sensors](https://www.sciencedirect.com/science/article/abs/pii/S0269749118316129) at the University of Utah found that one sensor exhibited significant drift partway through the study, with dust deposition on the photodetector causing declining response to light scattering. A [subsequent study](https://www.sciencedirect.com/science/article/abs/pii/S0021850223001210) identified performance changes in the PMS5003 that correlated with extended deployment duration.

Meanwhile, the [South Coast AQMD evaluation](https://www.aqmd.gov/docs/default-source/aq-spec/resources-page/airsensor-v1-0---enhancements-to-the-open-source-r-package-to-enable-deep-understanding-of-the-long-term-performance-and-reliability-of-purpleair-sensors.pdf) of approximately 400 PurpleAir sensors over three years found dramatic variability in performance driven by seasonal trends and particulate source type — exactly the kind of inconsistency that makes accuracy-at-calibration meaningless.

By contrast, Sensirion's SPS30 particulate matter sensor is rated for a [10+ year lifetime with built-in contamination resistance](https://sensirion.com/products/catalog/SPS30) — it costs more upfront, but it's the kind of sensor that a permanent network needs.

## Why Stability Wins

### Emergent Accuracy

A network of thousands of slightly imprecise but **stable** sensors achieves **emergent accuracy** — the statistical aggregate is more accurate than any individual sensor. This only works when sensors are consistent over time.

Recent research supports this approach. A [2025 study in Nature npj Climate and Atmospheric Science](https://www.nature.com/articles/s41612-025-01145-2) demonstrated a trust-based consensus calibration framework where sensors that consistently agree with reference standards and reliable peers receive higher weighting, while those showing drift are down-weighted. The network self-corrects — but only when individual sensors are stable enough for the algorithm to distinguish drift from real environmental variation.

The [EPA Air Sensor Toolbox](https://www.epa.gov/air-sensor-toolbox) provides extensive evaluation data showing that low-cost sensor networks can approach reference-grade accuracy when properly understood — but the key finding across their evaluations is that **sensor-to-sensor consistency matters more than individual sensor accuracy**.

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

See [Recommended Sensors](/getting-started/recommended-sensors) for our specific sensor choices based on this philosophy.
