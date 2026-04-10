# Firmware Setup

One-time setup for compiling and flashing the WeSense firmware to your ESP32 board.

## Install Arduino IDE

1. Download and install the [Arduino IDE](https://www.arduino.cc/en/software) (version 2.x recommended)
2. Add ESP32 board support: **File → Preferences → Additional Board Manager URLs**, add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Install the ESP32 boards package: **Tools → Board → Boards Manager**, search "esp32" and install **esp32 by Espressif Systems**

## Select Your Board

Go to **Tools → Board → ESP32 Arduino** and select your board:

| Physical Board | Arduino Board Selection |
|---------------|------------------------|
| ESP32 DevKit / WROOM-32 | ESP32 Dev Module |
| ESP32-C3 Generic | ESP32C3 Dev Module |
| ESP32-C6 Beetle / Generic | ESP32C6 Dev Module |
| ESP32-S3 Generic | ESP32S3 Dev Module |
| T-Beam v1.x | ESP32 Dev Module |
| T-Beam T3 S3 v1.2 | ESP32S3 Dev Module |

### USB CDC On Boot (C3, C6, S3 boards)

ESP32-C3, C6, and S3 boards use native USB (no external USB-Serial chip). You need to enable USB CDC for the serial monitor to work:

**Tools → USB CDC On Boot → Enabled**

Without this, you won't see any output in the serial monitor after flashing. This is one of the most common gotchas with newer ESP32 boards.

## Set Partition Scheme

**Tools → Partition Scheme → Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)**

::: danger Required
The default partition is too small for the WeSense firmware (which includes WiFi, MQTT, TLS, protobuf, LoRaWAN, and all sensor drivers). If you see "Sketch too big" errors, this is the first thing to check. You must set this every time you change board type — the setting is per-board.
:::

## Select Port

**Tools → Port → [Your USB port]**

Connect your board via USB. The port will appear as:
- **macOS**: `/dev/cu.usbmodem*` or `/dev/cu.SLAB_USBtoUART`
- **Windows**: `COM3`, `COM4`, etc.
- **Linux**: `/dev/ttyUSB0` or `/dev/ttyACM0`

If the port doesn't appear:
- Try a different USB cable (some are charge-only with no data lines)
- On C3/C6/S3 boards, you may need to hold the **BOOT** button while plugging in
- Install the [CP2102 driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers) if using a board with an external USB-Serial chip

## Install Libraries

The firmware requires several Arduino libraries. Install them via **Sketch → Include Library → Manage Libraries**:

| Library | Used For |
|---------|----------|
| **SensirionI2cSht4x** | SHT40/41/45 temperature & humidity |
| **Adafruit AHTX0** | AHT20 temperature & humidity |
| **SparkFun SCD30 Arduino Library** | SCD30 CO2 sensor |
| **SparkFun SCD4x Arduino Library** | SCD40/41 CO2 sensor |
| **SensirionI2CSgp41** | SGP41 VOC/NOx sensor |
| **Adafruit BME680 Library** | BME680 environmental sensor |
| **Adafruit BMP280 Library** | BMP280 pressure sensor |
| **Adafruit BMP3XX Library** | BMP390 pressure sensor |
| **Adafruit INA219** | INA219 power monitor |
| **Adafruit INA226** | INA226 power monitor |
| **Adafruit TSL2591 Library** | TSL2591 light sensor |
| **Adafruit LTR390 Library** | LTR-390UV UV sensor |
| **Adafruit BH1750** | BH1750 light sensor |
| **Nanopb** | Protobuf encoding |
| **PubSubClient** | MQTT client |
| **ArduinoJson** | JSON parsing for MQTT commands |
| **RadioLib** | LoRaWAN (only needed for LoRa boards) |

The Arduino IDE will also prompt you to install dependencies when you first open the firmware sketch.

## Download and Flash

1. Clone or download the firmware: [github.com/wesense-earth/wesense-sensor-firmware](https://github.com/wesense-earth/wesense-sensor-firmware)
2. Open `wesense-sensor-firmware.ino` in Arduino IDE
3. Edit your configuration (see [Firmware Configuration](/getting-started/firmware-configuration))
4. Click **Upload** (→ button)
5. Open **Serial Monitor** (115200 baud) to verify it's working

## Summary Checklist

Before uploading, verify these Arduino IDE settings:

- [ ] Board type matches your hardware
- [ ] **Partition Scheme** set to **Minimal SPIFFS**
- [ ] **USB CDC On Boot** enabled (C3/C6/S3 boards only)
- [ ] Port selected
- [ ] Required libraries installed
- [ ] Configuration edited (`credentials.h` and `wesense-sensor-firmware.ino`)
