# Build a WeSense Node

A WeSense node is an ESP32-based environmental sensor that reports readings every 5 minutes over WiFi or LoRaWAN. No cloud account needed — your data goes directly to the WeSense network.

## What You Need

### 1. An ESP32 Board

Any of these supported boards will work. The firmware auto-detects your board type at startup.

| Board | LoRa | Best For | Approx Cost |
|-------|------|----------|-------------|
| **ESP32 DevKit / WROOM-32** | No | Simplest build, WiFi only | ~$5-10 |
| **ESP32-C3 Generic** | No | Compact, budget-friendly | ~$4-8 |
| **ESP32-C6 Beetle / Generic** | No | WiFi 6, compact | ~$6-10 |
| **ESP32-S3 Generic** | No | More processing power | ~$8-15 |
| **T-Beam v1.x (Lilygo)** | Yes (SX1276) | LoRaWAN + GPS | ~$30-50 |
| **T-Beam T3 S3 v1.2 (Lilygo)** | Yes (SX1262) | LoRaWAN + GPS + solar/battery | ~$35-55 |

### 2. Sensors

Choose from the [Recommended Sensors](/getting-started/recommended-sensors) list. At minimum, you need a temperature/humidity sensor. Here are some example builds:

**Basic (temp/humidity only) — ~$15 total:**
- ESP32-C3 + SHT41

**Standard (temp/humidity + CO2 + pressure) — ~$50 total:**
- ESP32 DevKit + SHT45 + SCD40 + MS5611

**Full environmental — ~$120 total:**
- ESP32 DevKit + SHT45 + SCD30 + SPS30 + MS5611 + TSL2591

**LoRaWAN outdoor — ~$100 total:**
- T-Beam T3 S3 + SHT45 + SPS30 (solar/battery powered, no WiFi needed)

### 3. A USB Cable and Computer

For flashing the firmware. Most ESP32 boards use USB-C or Micro-USB.

## Wiring

### I2C Sensors (most sensors)

Most sensors use I2C — four wires, same for every sensor:

```
ESP32 Board    →    Sensor
───────────         ───────
SDA            →    SDA
SCL            →    SCL
3.3V           →    VCC
GND            →    GND
```

Multiple I2C sensors share the same bus — just connect them all to the same SDA/SCL pins. The firmware detects which sensors are present automatically.

**I2C pin assignments by board:**

| Board | SDA | SCL |
|-------|-----|-----|
| ESP32 DevKit / WROOM-32 | GPIO 21 | GPIO 22 |
| T-Beam v1.x | GPIO 21 | GPIO 22 |
| T-Beam T3 S3 v1.2 | GPIO 17 | GPIO 18 |
| ESP32-S3 Generic | GPIO 8 | GPIO 9 |
| ESP32-C3 Generic | GPIO 4 | GPIO 5 |
| ESP32-C6 Beetle / Generic | GPIO 19 | GPIO 20 |

### UART Sensors (PMS5003, C8 CO2)

UART sensors need four wires but connect to different pins. Only one UART sensor can be connected at a time — the firmware auto-detects which is present.

```
ESP32 Board    →    UART Sensor
───────────         ───────────
RX             →    TX
TX             →    RX
5V/VIN         →    VCC (requires 5V, not 3.3V)
GND            →    GND
```

**UART pin assignments by board:**

| Board | RX | TX | Notes |
|-------|----|----|-------|
| ESP32 DevKit / WROOM-32 | GPIO 16 | GPIO 17 | UART2 |
| T-Beam v1.x | GPIO 16 | GPIO 17 | UART2 |
| T-Beam T3 S3 v1.2 | GPIO 16 | GPIO 15 | UART2 |
| ESP32-S3 Generic | GPIO 44 | GPIO 43 | UART2 |
| ESP32-C3 Generic | GPIO 20 | GPIO 21 | UART1 |
| ESP32-C6 Beetle / Generic | GPIO 17 | GPIO 16 | UART1 |

::: warning UART sensors need 5V
PMS5003 and C8 CO2 sensors require 5V power. Connect VCC to the board's VIN or 5V pin, not 3.3V.
:::

## Flash the Firmware

See [Firmware Setup](/getting-started/firmware-setup) for the complete guide — Arduino IDE installation, board selection, partition scheme, USB CDC, library installation, and flashing.

The short version:

1. Install [Arduino IDE](https://www.arduino.cc/en/software) with ESP32 board support
2. Select your board, set **Partition Scheme → Minimal SPIFFS**, enable **USB CDC On Boot** (C3/C6/S3 boards)
3. Install the required libraries (see [Firmware Setup](/getting-started/firmware-setup#install-libraries) for the full list)
4. Edit your configuration (see below)
5. Click **Upload**

## Configure

At minimum, you need to set your WiFi credentials in `credentials.h`:

```cpp
#define WIFI_SSID "YourWiFiNetwork"
#define WIFI_PASSWORD "YourWiFiPassword"
```

And optionally set your location in `wesense-sensor-firmware.ino`:

```cpp
const bool INCLUDE_LOCATION_IN_MQTT = true;
const float FIXED_LATITUDE = -36.8485;
const float FIXED_LONGITUDE = 174.7633;
```

Everything else has sensible defaults — the firmware connects to `mqtt.wesense.earth` with TLS encryption automatically.

See [Firmware Configuration](/getting-started/firmware-configuration) for a complete walkthrough of every setting.

## Verify It's Working

1. Open the **Serial Monitor** in Arduino IDE (115200 baud)
2. You should see:
   - WiFi connection confirmation
   - MQTT connection to `mqtt.wesense.earth`
   - Sensor detection messages (listing which sensors were found)
   - Sensor readings being published every 5 minutes
3. Check the [live map](https://map.wesense.earth) — your sensor should appear within a few minutes

## Troubleshooting

### Sensor Not Detected
- Check wiring — SDA/SCL for I2C, TX/RX for UART
- Verify power supply voltage — 3.3V for I2C sensors, 5V for UART sensors
- The firmware logs which sensors it finds at startup — check the serial monitor

### WiFi Won't Connect
- Verify SSID and password are correct (case-sensitive)
- Ensure your network is 2.4GHz — ESP32 doesn't support 5GHz WiFi

### MQTT Connection Failed
- If using default settings, check your internet connection
- If using your own broker, verify the IP/hostname, port, and credentials

### "Sketch Too Big" Error
- Change partition scheme: **Tools → Partition Scheme → Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)**

### Readings Seem Wrong
- Allow warmup time — CO2 sensors need up to 7 days for full ASC calibration, other sensors are immediate
- Check calibration status in the serial monitor output

## What's Next?

- [Firmware Configuration](/getting-started/firmware-configuration) — understand every setting
- [Managing Your Sensor](/getting-started/managing-your-sensor) — MQTT commands, calibration, remote diagnostics
- [Firmware Updates](/getting-started/firmware-update) — keeping your sensor up to date
- [Board Configurations](/hardware/board-configurations) — detailed per-board wiring diagrams and quirks
- [Recommended Sensors](/getting-started/recommended-sensors) — detailed sensor specifications and datasheets
