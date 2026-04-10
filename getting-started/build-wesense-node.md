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

### Option 1: Arduino IDE

1. Install the [Arduino IDE](https://www.arduino.cc/en/software)
2. Add ESP32 board support: **File → Preferences → Additional Board Manager URLs**, add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Install the ESP32 boards: **Tools → Board → Boards Manager**, search for "esp32" and install
4. Select your board: **Tools → Board → ESP32 Arduino → [Your Board]**
5. **Change the partition scheme**: **Tools → Partition Scheme → Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)**

   ::: warning Required step
   The default partition is too small for the WeSense firmware. If you see "Sketch too big" errors, this is the first thing to check.
   :::

6. Clone or download the firmware: [github.com/wesense-earth/wesense-sensor-firmware](https://github.com/wesense-earth/wesense-sensor-firmware)
7. Open `wesense-sensor-firmware.ino` in Arduino IDE
8. Install required libraries (the IDE will prompt you, or see the repo README)
9. Connect your board via USB
10. Click **Upload**

### Option 2: Pre-built Binary (coming soon)

<!-- TODO: Add web-based ESP flasher instructions when available -->

## Configure

Edit the configuration section at the top of `wesense-sensor-firmware.ino` before flashing:

### WiFi & MQTT (minimum required)

```cpp
const char* wifi_ssid = "YourWiFiNetwork";
const char* wifi_password = "YourWiFiPassword";
```

By default, the firmware connects to `mqtt.wesense.earth` on port 8883 (encrypted). You don't need to change the MQTT settings unless you're running your own station.

### Location (optional but recommended)

```cpp
const bool INCLUDE_LOCATION_IN_MQTT = true;
const float FIXED_LATITUDE = -36.8485;
const float FIXED_LONGITUDE = 174.7633;
```

Set your approximate location so your data appears on the map. You can offset your coordinates for privacy — your data will still be useful at neighbourhood level without revealing your exact address.

T-Beam boards with GPS will determine location automatically.

### LoRaWAN (for LoRa boards only)

The default WeSense TTN credentials are built into the firmware. For most users, just set the regional frequency plan:

```cpp
#define LORAWAN_REGION_AU915  // Australia/New Zealand
// #define LORAWAN_REGION_EU868  // Europe
// #define LORAWAN_REGION_US915  // North America
// #define LORAWAN_REGION_AS923  // Asia-Pacific
```

If you prefer to use your own TTN application, replace the credentials in the firmware. See the [Configuration wiki](https://github.com/wesense-earth/wesense-sensor-firmware/wiki/Configuration) for full LoRaWAN setup instructions.

### TLS (encrypted MQTT)

Enabled by default when connecting to `mqtt.wesense.earth`. The firmware includes the ISRG Root X1 CA certificate (Let's Encrypt root, valid until 2035), so encrypted connections work without any configuration.

For LAN-only deployments with self-signed certificates, see the [Configuration wiki](https://github.com/wesense-earth/wesense-sensor-firmware/wiki/Configuration).

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

- [Firmware Updates](/getting-started/firmware-update) — keeping your sensor up to date
- [Recommended Sensors](/getting-started/recommended-sensors) — detailed sensor specifications and datasheets
- [Sensor Specifications](/hardware/sensor-specs) — technical reference (I2C addresses, priorities, calibration periods)
