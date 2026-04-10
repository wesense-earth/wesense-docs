# Recommended Sensors

> **Our philosophy: durability over accuracy.** A sensor that drifts 5% but runs reliably for 5 years is far more valuable to a permanent network than one that's accurate to 0.1% but needs recalibration every 3 months. Read [Why Durability Over Accuracy](../data/why-durability-over-accuracy.md) for the evidence behind this approach.

## What We're Measuring

WeSense sensors can report any combination of:

| Reading Type | What It Tells You |
|-------------|-------------------|
| Temperature | Indoor/outdoor temperature, thermal efficiency |
| Humidity | Comfort, mould risk, dew point |
| Pressure | Weather patterns, altitude |
| CO2 | Ventilation quality, occupancy |
| PM2.5 / PM10 | Air quality, wildfire smoke, traffic pollution |
| VOC | Volatile organic compounds (paints, cleaners, off-gassing) |
| NOx | Combustion byproducts, traffic |

## Recommended Sensor Combinations

<!-- TODO: Populate with tested combinations from sensor-firmware docs -->
<!-- Include: sensor model, approximate cost, expected lifespan, drift characteristics -->
<!-- Focus on: low maintenance, availability, community-tested longevity -->

## Where to Buy

<!-- TODO: Supplier links for each region -->

## What About Accuracy?

Many sensor guides focus on laboratory accuracy. We focus on **stability over time** because:

- A global network of thousands of slightly-imprecise-but-stable sensors achieves **emergent accuracy** — the aggregate is more accurate than any individual sensor
- Calibration degrades — an "accurate" sensor that drifts unchecked gives worse data than a stable sensor that was never calibrated
- Most people will not recalibrate sensors — any design that requires periodic calibration will fail at scale
- Government reference stations provide the accuracy baseline — community sensors provide the density

See [Why Durability Over Accuracy](../data/why-durability-over-accuracy.md) for detailed evidence.
