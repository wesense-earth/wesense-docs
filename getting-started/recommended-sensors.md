# Recommended Sensors

## Sensor Selection Philosophy

When selecting sensors for WeSense, we prioritise in this order:

1. **Zero Maintenance** - Consumer sensors must work out of the box and stay accurate for years. If a sensor drifts, requires periodic calibration, or needs cleaning, it is not suitable for consumer deployment.

2. **Long-Term Stability** - Drift is the enemy. A sensor that is +-1C accurate but never drifts beats a +-0.1C sensor that drifts +-2C over a year.

3. **Accuracy** - Only matters after maintenance and stability are satisfied. The difference between +-0.2C and +-0.3C is irrelevant if both sensors are stable.

Read [Why Durability Over Accuracy](/data/why-durability-over-accuracy) for the detailed evidence behind this approach.

### Maintenance Score Definitions

| Score | Meaning | In Practice |
|-------|---------|-------------|
| **Excellent (1)** | Factory calibrated for life | Plug in and forget forever. No user action ever needed. |
| **Very Good (2)** | Factory calibrated, minor caveat | Either needs one-time setup, OR has 4-star stability instead of 5-star. |
| **Good (2-2.5)** | Generally stable | May have minor drift over many years. Acceptable for most uses. |
| **Medium (3-3.5)** | Requires attention | Needs algorithmic compensation OR has known drift. Check periodically. |
| **High (4)** | Ongoing compensation | Provides relative measurements only. Not recommended for consumer deployment. |
| **Low (4.5-5)** | High maintenance | Drifts significantly. Requires periodic cleaning or calibration. Not recommended. |

### Stability Star Definitions

| Stars | Meaning | In Practice |
|-------|---------|-------------|
| 5-star | Medical/Industrial grade | Essentially zero drift. Will read the same in 5 years as day one. |
| 4-star | Excellent for deployment | Very low drift. Acceptable for long-term unattended operation. |
| 3-star | Good with caveats | Some drift expected over years. May need periodic verification. |
| 2-star | Noticeable drift | Requires algorithmic compensation or periodic recalibration. |
| 1-star | Significant drift | Not suitable for unattended deployment. |

---

## Best-in-Class Sensors (Priority 0)

| Sensor | Type | Calibration | Stability | Maint Score | Price (NZD) |
|--------|------|-------------|-----------|-------------|-------------|
| **TMP117** | Temp | None | 5-star | Excellent (1) | $20-26 |

Priority 0 sensors are special affordable best-in-class sensors with lifetime drift avoidance, no maintenance, zero calibration requirements and higher accuracy than Priority 1 sensors.

## Recommended Sensors (Priority 1)

These are the sensors we recommend for new builds. All have zero ongoing maintenance and minimal or no drift. These are excellent sensors and are what we recommend you buy if you can afford them.

| Sensor | Type | Calibration | Stability | Maint Score | Price (NZD) |
|--------|------|-------------|-----------|-------------|-------------|
| **SHT45** | Temp + Humidity | None | 5-star | Excellent (1) | $11-22 |
| **SCD30** | CO2 | One-time FRC recommended | 5-star | Excellent (1.5) | $15-20 |
| **SPS30** | PM2.5/PM10 | None | 5-star | Excellent (1) | $43 |
| **INA226** | Power | None | 5-star | Excellent (1) | $4-10 |
| **MS5611** | Pressure | None | 4-star | Very Good (2) | $7 |
| **TSL2591** | Light | None | 4-star | Very Good (2) | $4-8 |
| **LTR-390UV** | UV | None | 4-star | Very Good (2) | $12 |
| **INMP441** | Noise | None (needs DSP) | 3-star | High (4)* | $2-6 |

*Noise sensors have no zero-maintenance option due to DSP requirements. Component is stable.

**Note on 4-star stability:** MS5611, TSL2591, and LTR-390UV have 4-star stability because no 5-star zero-calibration option exists in their categories. They are still zero-maintenance but may exhibit very minor drift over many years.

### Air Quality Monitoring

Air quality can be measured several ways. We recommend CO2 and PM as primary indicators:

| Metric | What It Measures | Best Sensor | Stability | Recommended? |
|--------|------------------|-------------|-----------|--------------|
| **CO2** | Indoor ventilation quality | SCD30 | 5-star | YES - Primary indicator |
| **PM2.5/PM10** | Particulate pollution (dust, smoke, pollen) | SPS30 | 5-star | YES - Primary indicator |
| **VOC Index** | Volatile organic compounds | SGP41 | 2-star | NO - See "Supported But Not Recommended" |

---

## Alternative Sensors (Priority 2)

These sensors work well but have minor caveats compared to Priority 1 options. However they are still solid options — if you're on a budget, these are what you buy.

| Sensor | Type | Calibration | Stability | Caveat | Price (NZD) |
|--------|------|-------------|-----------|--------|-------------|
| **BMP390** | Pressure | One-time offset | 4-star | Requires one-time offset calibration using local pressure data. Best accuracy once calibrated. | $5-12 |
| **SCD40/41** | CO2 | One-time FRC recommended | 4-star | PAS technology, slightly less stable than SCD30's dual-channel NDIR. | $20-53 |
| **SHT41** | Temp + Humidity | None | 5-star | Same stability as SHT45, just lower accuracy. Budget option. | $4-8 |
| **SEN55** | Multi (PM/VOC/NOx/T/H) | None | 4-star | All-in-one convenience. No CO2. VOC/NOx components have drift caveats. | $65-80 |
| **INA219** | Power | None | 5-star | Same stability as INA226, lower precision. Budget option. | $1-5 |

---

## Supported But Not Recommended

These sensors are supported by the firmware and we will log data from them if present, but we do not recommend purchasing them for new builds due to maintenance or drift concerns.

| Sensor | Type | Maint Score | Stability | Why Not Recommended |
|--------|------|-------------|-----------|---------------------|
| **SGP41** | VOC/NOx | High (4) | 2-star | Provides relative index only, not absolute measurements. Relies on algorithmic compensation. Useful for detecting sudden changes but not reliable for long-term absolute readings. |
| **SGP40** | VOC | High (4) | 2-star | Same as SGP41 but without NOx. |
| **BME680** | VOC + T/H/P | Medium (3.5) | 2-star | VOC requires 48h burn-in and BSEC library. T/H/P sensors are low priority compared to dedicated sensors. |
| **PMS5003** | PM | Low (4.5) | 2-star | Drifts due to optical fouling. Requires periodic cleaning. Lifespan limited by internal fan. Use SPS30 instead. |
| **SDS011** | PM | Low (4.5) | 2-star | Same drift and cleaning issues as PMS5003. |
| **AHT20** | T/H | Low (4.5) | 2-star | Moderate drift. Poor long-term confidence. Use SHT4x instead. |
| **BMP280** | Pressure | Good (2) | 3-star | High solder drift risk. Needs one-time offset calibration. Use MS5611 or BMP390 instead. |
| **CM1106-C** | CO2 | Low (5) | 1-star | Single-channel NDIR with ABC. Not recommended for 24/7 indoor spaces where fresh air exposure cannot be guaranteed. |

---

## Detailed Sensor Information

### Temperature and Humidity

#### SHT45 (Sensirion) — Recommended
The best integrated temperature and humidity sensor. Zero maintenance, factory calibrated for life.

| Specification | Value |
|--------------|-------|
| Temperature Accuracy | +-0.2C |
| Humidity Accuracy | +-1.8% RH |
| Stability | 5-star (zero drift) |
| I2C Address | 0x44 (fixed) |
| Power | 3.3V, <1mA |
| Calibration | Factory calibrated, immediate use |

#### SHT41 (Sensirion) — Budget Alternative
Same excellent stability as SHT45, slightly lower accuracy. Good budget option.

| Specification | Value |
|--------------|-------|
| Temperature Accuracy | +-0.3C |
| Humidity Accuracy | +-3% RH |
| Stability | 5-star (zero drift) |
| I2C Address | 0x44 (fixed) |
| Power | 3.3V, <1mA |
| Calibration | Factory calibrated, immediate use |

#### TMP117 (Texas Instruments) — Precision Temperature
Only needed if you specifically require +-0.1C medical-grade precision. For most applications, SHT45 is sufficient.

| Specification | Value |
|--------------|-------|
| Temperature Accuracy | +-0.1C (from -20C to +50C) |
| Temperature Range | -55C to +150C |
| Resolution | 0.0078C (16-bit) |
| Stability | 5-star (NIST traceable) |
| I2C Address | 0x48 (default), configurable |
| Power | 3.3V, 3.5uA typical |
| Calibration | Factory calibrated, immediate use |

> **Note:** Temperature-only sensor. Pair with SHT45 for humidity measurement.

#### AHT20 (Aosong) — Not Recommended

| Specification | Value |
|--------------|-------|
| Temperature Accuracy | +-0.3C |
| Humidity Accuracy | +-2% RH |
| Stability | 2-star (moderate drift) |
| I2C Address | 0x38 |

> **Warning:** Not recommended for new builds. Known for poor long-term stability and drift. Use SHT4x instead.

---

### CO2 Sensors

#### SCD30 (Sensirion) — Recommended
Dual-channel NDIR CO2 sensor with superior long-term stability. The dual-channel design provides hardware-level drift compensation.

| Specification | Value |
|--------------|-------|
| Range | 400-40000 ppm |
| Accuracy | +-(30 ppm + 3% of reading) |
| Stability | 5-star (dual-channel compensation) |
| I2C Address | 0x61 |
| Power | 3.3-5.5V, ~19mA average |
| Technology | Dual-Channel NDIR |
| Calibration | 7 days ASC; one-time FRC recommended at install |

**Why SCD30 over SCD4x:** The dual-channel NDIR technology provides hardware-level drift compensation, making it more stable long-term than the SCD4x's photoacoustic sensing.

#### SCD4x (Sensirion) — Alternative
Photoacoustic CO2 sensor. Smaller form factor than SCD30, slightly less stable long-term.

| Specification | Value |
|--------------|-------|
| Range | 400-5000 ppm (SCD41) or 400-2000 ppm (SCD40) |
| Accuracy | +-(40 ppm + 5% of reading) |
| Stability | 4-star |
| I2C Address | 0x62 |
| Power | 3.3V, ~18mA average |
| Technology | Photoacoustic Sensing (PAS) |
| Calibration | 7 days ASC; one-time FRC recommended at install |

#### CM1106-C (Winsen) — Not Recommended

| Specification | Value |
|--------------|-------|
| Range | 400-5000 ppm |
| Accuracy | +-(50 ppm + 5% of reading) |
| Stability | 1-star (ABC reliant) |
| I2C Address | 0x31 |
| Power | **5V required** (4.5-5.5V) |
| Technology | Single-Channel NDIR |
| Calibration | 15 days ABC cycle |

> **Warning:** Not recommended. ABC requires regular exposure to fresh air (~400ppm CO2) to maintain accuracy. Not suitable for 24/7 indoor spaces.

---

### Pressure Sensors

#### MS5611 (TE Connectivity) — Recommended
High-resolution barometric pressure sensor. Truly zero-maintenance with no calibration required.

| Specification | Value |
|--------------|-------|
| Pressure Range | 10-1200 mbar |
| Resolution | 0.012 mbar |
| Stability | 4-star |
| I2C Address | 0x76 or 0x77 |
| Power | 3.3V |
| Calibration | Factory calibrated, no user action needed |

#### BMP390L (Bosch) — Alternative
Best-in-class accuracy, but requires one-time offset calibration after assembly.

| Specification | Value |
|--------------|-------|
| Pressure Accuracy | +-0.03 hPa (+-3 Pa) |
| Pressure Range | 300-1250 hPa |
| Stability | 4-star |
| I2C Address | 0x76 or 0x77 |
| Power | 3.3V, ~3.4uA |
| Calibration | One-time offset calibration recommended |

> **Note:** Requires one-time offset calibration using local pressure/altitude data to mitigate solder-induced offset. Once calibrated, no further maintenance needed.

#### BMP280 (Bosch) — Not Recommended

| Specification | Value |
|--------------|-------|
| Pressure Accuracy | +-1.0 hPa |
| Stability | 3-star (solder drift risk) |
| I2C Address | 0x76 or 0x77 |

> **Warning:** High risk of solder-induced drift. Use MS5611 or BMP390 instead.

---

### Particulate Matter Sensors

#### SPS30 (Sensirion) — Recommended
Laser-scattering particulate matter sensor with built-in contamination resistance and 10+ year lifetime.

| Specification | Value |
|--------------|-------|
| Measurements | PM1.0, PM2.5, PM4, PM10 (ug/m3) |
| Accuracy | +-10% |
| Stability | 5-star (contamination resistant) |
| Interface | I2C or UART |
| I2C Address | 0x69 |
| Power | 5V, ~60mA average |
| Lifetime | 10+ years |
| Calibration | Factory calibrated, no maintenance |

#### PMS5003 (Plantower) — Not Recommended

| Specification | Value |
|--------------|-------|
| Measurements | PM1.0, PM2.5, PM10 (ug/m3) |
| Stability | 2-star (drifts) |
| Interface | UART (9600 baud) |
| Power | 5V, ~100mA active |

> **Warning:** Drifts due to optical fouling, requires periodic cleaning, and has limited lifespan due to internal fan. Use SPS30 instead.

---

### Air Quality Sensors

#### SGP41 (Sensirion) — Not Recommended

| Specification | Value |
|--------------|-------|
| VOC Index | 0-500 (relative scale) |
| NOx Index | 0-500 (relative scale) |
| Stability | 2-star (algorithm-managed) |
| I2C Address | 0x59 |
| Calibration | 12 hours conditioning |

> **Warning:** Provides relative index values only, not absolute concentrations. For reliable air quality monitoring, use CO2 (SCD30) and PM (SPS30) sensors instead.

#### BME680 (Bosch) — Not Recommended

| Specification | Value |
|--------------|-------|
| Gas Resistance | kOhm (for VOC indication) |
| Also measures | Temp (+-0.5C), Humidity (+-3% RH), Pressure (+-0.6 hPa) |
| Stability | 2-star |
| I2C Address | 0x76 or 0x77 |
| Calibration | 48 hours BSEC burn-in |

> **Warning:** VOC measurement requires 48h burn-in and complex BSEC library. T/H/P sensors are lower priority than dedicated sensors. Supported for existing installations.

---

### Light Sensors

#### TSL2591 (ams-OSRAM) — Recommended

| Specification | Value |
|--------------|-------|
| Range | 188 uLux to 88,000 Lux |
| Channels | Visible + IR (separate) |
| Stability | 4-star |
| I2C Address | 0x29 |
| Calibration | Factory calibrated, no maintenance |

---

### UV Sensors

#### LTR-390UV (Lite-On) — Recommended

| Specification | Value |
|--------------|-------|
| UV Resolution | 13-bit |
| ALS Resolution | 20-bit |
| Stability | 4-star |
| I2C Address | 0x53 |
| Calibration | Factory calibrated, no maintenance |

---

### Power Monitoring

#### INA226 (Texas Instruments) — Recommended

| Specification | Value |
|--------------|-------|
| Bus Voltage | 0-36V |
| Resolution | 16-bit ADC |
| Stability | 5-star |
| I2C Address | 0x40-0x4F (configurable) |
| Calibration | Factory calibrated, no maintenance |

#### INA219 (Texas Instruments) — Budget Alternative

| Specification | Value |
|--------------|-------|
| Bus Voltage | 0-26V |
| Current Range | 0-3.2A (with 0.1 Ohm shunt) |
| Resolution | 12-bit |
| Stability | 5-star |
| I2C Address | 0x40-0x4F (configurable) |
| Calibration | Factory calibrated, no maintenance |

---

### Noise Sensors

#### INMP441 (InvenSense) — Recommended

| Specification | Value |
|--------------|-------|
| SNR | 61dB |
| Sensitivity | -26dBFS |
| Interface | I2S |
| Power | 3.3V |

> **Note:** All noise sensors require DSP processing to calculate dB SPL. There is no zero-maintenance option in this category.

---

## Multi-Sensor Modules

Sensirion offers all-in-one modules that combine multiple sensors into a single package. These simplify builds at the cost of flexibility.

| Module | Sensors | CO2? | T/H Grade | Price (NZD) |
|--------|---------|------|-----------|-------------|
| **SEN54** | PM + VOC + NOx + T/H | No | Standard (+-0.45C, +-4.5%RH) | $45-55 |
| **SEN55** | PM + VOC + NOx + T/H | No | Premium (+-0.2C, +-1.5%RH) | $50-65 |
| **SEN66** | PM + VOC + NOx + CO2 + T/H | Yes (SCD4x-based) | Standard | $70-85 |
| **SEN68** | PM + VOC + NOx + CO2 + T/H | Yes (SCD4x-based) | Premium | $80-100 |

All SEN modules are factory calibrated with no ongoing maintenance. The CO2-equipped modules (SEN66/68) benefit from one-time FRC on installation.

---

## Full Sensor Comparison Spreadsheet

For the complete dataset with all 50+ sensors, download the [full sensor comparison spreadsheet](/datasheets/WeSense%20-%20Sensor%20Comparison.csv). Columns include maintenance scores, stability ratings, accuracy details, prices, technologies, interfaces, calibration specs, and Arduino libraries.

## Datasheets

### Temperature & Humidity
- [SHT4x — SHT40, SHT41, SHT45 (Sensirion)](/datasheets/SHT4x.pdf)
- [TMP117 (Texas Instruments)](/datasheets/TMP117.pdf)
- [SHTC3 (Sensirion)](/datasheets/SHTC3.pdf)
- [AHT20 (Aosong)](/datasheets/AHT20.pdf)

### CO2
- [SCD30 (Sensirion)](/datasheets/SCD30.pdf)
- [SCD4x — SCD40, SCD41 (Sensirion)](/datasheets/SCD4x.pdf)
- [CM1106-C (Winsen)](/datasheets/CM1106-C.pdf)

### Pressure
- [BMP390 (Bosch)](/datasheets/BMP390.pdf)
- [MS5611 (TE Connectivity)](/datasheets/MS5611.pdf)
- [BME280 (Bosch)](/datasheets/BME280.pdf)
- [BMP280 (Bosch)](/datasheets/BMP280.pdf)

### Particulate Matter
- [SPS30 (Sensirion)](/datasheets/SPS30.pdf)
- [PMS5003 (Plantower)](/datasheets/PMS5003.pdf)
- [SDS011 (Nova Fitness)](/datasheets/SDS011.pdf)

### Air Quality (VOC/NOx)
- [SGP41 (Sensirion)](/datasheets/SGP41.pdf)
- [SGP40 (Sensirion)](/datasheets/SGP40.pdf)
- [BME680 (Bosch)](/datasheets/BME680.pdf)

### Light & UV
- [TSL2591 (ams-OSRAM)](/datasheets/TSL2591.pdf)
- [LTR-390UV (Lite-On)](/datasheets/LTR-390UV.pdf)
- [BH1750 (ROHM)](/datasheets/BH1750.pdf)

### Power Monitoring
- [INA226 (Texas Instruments)](/datasheets/INA226.pdf)
- [INA219 (Texas Instruments)](/datasheets/INA219.pdf)

### Noise
- [INMP441 (InvenSense/TDK)](/datasheets/INMP441.pdf)

### Multi-Sensor Modules
- [SEN5x — SEN54, SEN55 (Sensirion)](/datasheets/SEN5x.pdf)
- [SEN6x — SEN66, SEN68 (Sensirion)](/datasheets/SEN6x.pdf)

### Other
- [Aliexpress C8 CO2 Sensor](/datasheets/Aliexpress%20C8%20CO2%20Sensor.pdf)
