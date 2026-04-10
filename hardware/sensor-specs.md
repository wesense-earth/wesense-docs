# Sensor Specifications — Technical Reference

For sensor recommendations and buying guidance, see [Recommended Sensors](/getting-started/recommended-sensors).

This page provides technical reference for firmware developers and hardware integrators.

## Quick Reference

| Sensor | Type | Measurements | Interface | I2C Address | Calibration Period |
|--------|------|--------------|-----------|-------------|-------------------|
| **SHT45** | T/H | Temperature, Humidity | I2C | 0x44 | Immediate |
| **SHT41** | T/H | Temperature, Humidity | I2C | 0x44 | Immediate |
| **TMP117** | Temp | Temperature | I2C | 0x48 | Immediate |
| **SCD30** | CO2 | CO2, Temperature, Humidity | I2C | 0x61 | 7 days (if ASC enabled) |
| **SCD4x** | CO2 | CO2, Temperature, Humidity | I2C | 0x62 | 7 days (if ASC enabled) |
| **SPS30** | PM | PM1.0, PM2.5, PM4, PM10 | I2C/UART | 0x69 | Immediate |
| **MS5611** | Pressure | Pressure, Temperature | I2C/SPI | 0x76/0x77 | Immediate |
| **BMP390L** | Pressure | Pressure, Temperature | I2C | 0x76/0x77 | Immediate (one-time offset) |
| **TSL2591** | Light | Lux (visible + IR) | I2C | 0x29 | Immediate |
| **LTR-390UV** | UV | UV Index, Ambient Light | I2C | 0x53 | Immediate |
| **INA226** | Power | Voltage, Current, Power | I2C | 0x40-0x4F | Immediate |
| **INA219** | Power | Voltage, Current, Power | I2C | 0x40-0x4F | Immediate |
| **INMP441** | Noise | Audio (I2S) | I2S | N/A | Immediate |
| **SGP41** | Air Quality | VOC Index, NOx Index | I2C | 0x59 | 12 hours |
| **BME680** | Environmental | Temp, Humidity, Pressure, Gas | I2C | 0x76/0x77 | 48 hours |
| **PMS5003** | Particulate | PM1.0, PM2.5, PM10 | UART | N/A | 1 hour (fan warmup) |
| **CM1106-C** | CO2 | CO2 | I2C | 0x31 | 15 days (if ABC enabled) |
| **AHT20** | T/H | Temperature, Humidity | I2C | 0x38 | Immediate |
| **BMP280** | Pressure | Pressure, Temperature | I2C | 0x76/0x77 | Immediate |

---

## Sensor Priority Hierarchies

The firmware uses a priority system when multiple sensors measure the same parameter. Lower priority numbers are preferred.

### Temperature
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | SHT45 | 5-star | Best T/H combo, zero maintenance |
| 2 | SHT41 | 5-star | Budget T/H, same stability |
| 3 | TMP117 | 5-star | Best temp-only if +-0.1C needed |
| 4 | SCD30 | 5-star | Good accuracy from CO2 sensor |
| 5 | SEN55 | 4-star | Multi-sensor module |
| 6 | BME280 | 3-star | Backup from integrated sensor |
| 7 | BME680 | 2-star | Not recommended |
| 8 | AHT20 | 2-star | Not recommended — drifts |

### Humidity
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | SHT45 | 5-star | Best humidity sensor |
| 2 | SHT41 | 5-star | Budget option, same stability |
| 3 | SCD30 | 5-star | Good accuracy from CO2 sensor |
| 4 | SEN55 | 4-star | Multi-sensor module |
| 5 | BME280 | 3-star | Backup from integrated sensor |
| 6 | BME680 | 2-star | Not recommended |
| 7 | AHT20 | 2-star | Not recommended — drifts |

### CO2
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | SCD30 | 5-star | Dual-channel NDIR = best long-term stability |
| 2 | SCD4x | 4-star | PAS technology, smaller form factor |
| 3 | SEN66/68 | 4-star | Multi-sensor module with CO2 |
| 4 | CM1106-C | 1-star | Not recommended — ABC unreliable indoors |

### Pressure
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | MS5611 | 4-star | Zero calibration, excellent stability |
| 2 | BMP390 | 4-star | Best accuracy, needs one-time offset |
| 3 | BME280 | 3-star | Integrated T/H/P |
| 4 | BMP280 | 3-star | Budget, solder drift risk |
| 5 | BME680 | 2-star | Not recommended for pressure |

### Particulate Matter
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | SPS30 | 5-star | 10+ year lifetime, contamination resistant |
| 2 | SEN55 | 4-star | Multi-sensor module |
| 3 | PMS5003 | 2-star | Not recommended — drifts, needs cleaning |
| 4 | SDS011 | 2-star | Not recommended — drifts, needs cleaning |

### VOC/Air Quality
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | SGP41 | 2-star | Not recommended — relative only, but best available |
| 2 | SEN55 | 4-star | Multi-sensor module, same VOC limitations |
| 3 | SGP40 | 2-star | Not recommended — relative only |
| 4 | BME680 | 2-star | Not recommended — BSEC complexity |

### Light
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | TSL2591 | 4-star | High dynamic range, dual channel |
| 2 | VEML7700 | 2-star | Erratic above 70 klx |
| 3 | BH1750 | 3-star | Budget option |

### UV
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | LTR-390UV | 4-star | Less prone to solarization |
| 2 | VEML6075 | 2-star | Degrades in direct sunlight |

### Power Monitoring
| Priority | Sensor | Stability | Notes |
|----------|--------|-----------|-------|
| 1 | INA226 | 5-star | 16-bit precision |
| 2 | INA219 | 5-star | 12-bit, budget option |

---

## Calibration Periods Summary

During calibration, sensor data may be suppressed to prevent inaccurate readings from affecting your database.

| Sensor | Calibration Period | Trigger | Notes |
|--------|-------------------|---------|-------|
| SHT4x | Immediate | N/A | Factory calibrated for life |
| TMP117 | Immediate | N/A | NIST traceable, factory calibrated |
| SCD30 | 7 days | ASC enabled | Needs 1h exposure to ~400ppm fresh air daily |
| SCD4x | 7 days | ASC enabled | Needs 1h exposure to ~400ppm fresh air daily |
| SPS30 | Immediate | N/A | Factory calibrated, contamination resistant |
| MS5611 | Immediate | N/A | Factory calibrated |
| TSL2591 | Immediate | N/A | Factory calibrated |
| LTR-390UV | Immediate | N/A | Factory calibrated |
| INA226 | Immediate | N/A | Factory calibrated |
| CM1106-C | 15 days | ABC enabled | ABC configurable 1-30 days (Winsen default 7-15) |
| SGP41 | 12 hours | Always | 10s warmup + algorithm conditioning |
| BME680 | 48 hours | Always | BSEC gas sensor burn-in period |
| PMS5003 | 1 hour | Always | Fan/laser warmup |

---

## Full Spreadsheet

Download the [complete sensor comparison spreadsheet](/datasheets/WeSense%20-%20Sensor%20Comparison.csv) with all 50+ sensors, including maintenance scores, stability ratings, accuracy details, prices, technologies, interfaces, and Arduino library references.

## Datasheets

All datasheets are available on the [Recommended Sensors](/getting-started/recommended-sensors#datasheets) page.
