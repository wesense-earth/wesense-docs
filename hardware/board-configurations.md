# Board Configurations

WeSense firmware supports multiple ESP32 board variants. The firmware auto-detects your board type at startup. This page provides detailed pin assignments, wiring photos, and board-specific notes for each supported board.

<!-- TODO: Populate each board section with content from wesense-sensor-firmware.wiki-ready/Board-Configurations.md -->

## Supported Boards

<!-- IMAGE: /images/boards/board-lineup.jpg — All supported boards photographed side-by-side for scale -->

### ESP32 DevKit / WROOM-32

<!-- IMAGE: /images/boards/esp32-devkit-pinout.jpg — Photo of ESP32 DevKit with labelled pins -->
<!-- IMAGE: /images/boards/esp32-devkit-wiring.jpg — Photo of ESP32 DevKit wired to SHT45 + SCD30 -->

| Function | Pin |
|----------|-----|
| I2C SDA | GPIO 21 |
| I2C SCL | GPIO 22 |
| UART2 RX | GPIO 16 |
| UART2 TX | GPIO 17 |
| Secondary I2C SDA | GPIO 13 |
| Secondary I2C SCL | GPIO 14 |

<!-- TODO: Full details from Board-Configurations.md -->

### ESP32-C3 Generic

<!-- IMAGE: /images/boards/esp32-c3-pinout.jpg — Photo with labelled pins -->

| Function | Pin |
|----------|-----|
| I2C SDA | GPIO 4 |
| I2C SCL | GPIO 5 |
| UART1 RX | GPIO 20 |
| UART1 TX | GPIO 21 |

**Notes:** Single I2C controller only — cannot isolate sensors on separate buses. Uses UART1 (not UART2). Requires **USB CDC On Boot** enabled in Arduino IDE.

<!-- TODO: Full details from Board-Configurations.md -->

### ESP32-C6 Beetle (DFRobot) / Generic

<!-- IMAGE: /images/boards/esp32-c6-beetle-pinout.jpg — Photo with labelled pins -->
<!-- IMAGE: /images/boards/esp32-c6-beetle-wiring.jpg — Wiring example with sensors -->

| Function | Pin |
|----------|-----|
| I2C SDA | GPIO 19 |
| I2C SCL | GPIO 20 |
| Secondary I2C SDA (LP) | GPIO 6 |
| Secondary I2C SCL (LP) | GPIO 7 |
| UART1 RX | GPIO 17 |
| UART1 TX | GPIO 16 |
| Built-in LED | GPIO 15 |

**Notes:** WiFi 6 (802.11ax). Dual I2C controllers. Uses UART1 (not UART2). Ultra-compact (23x28mm for Beetle). Requires **USB CDC On Boot** enabled.

<!-- TODO: Full details from Board-Configurations.md -->

### ESP32-S3 Generic

<!-- IMAGE: /images/boards/esp32-s3-pinout.jpg — Photo with labelled pins -->

| Function | Pin |
|----------|-----|
| I2C SDA | GPIO 8 |
| I2C SCL | GPIO 9 |
| Secondary I2C SDA | GPIO 17 |
| Secondary I2C SCL | GPIO 18 |
| UART2 RX | GPIO 44 |
| UART2 TX | GPIO 43 |

**Notes:** Dual-core, higher performance. Dual I2C controllers. Requires **USB CDC On Boot** enabled.

<!-- TODO: Full details from Board-Configurations.md -->

### T-Beam v1.x (Lilygo)

<!-- IMAGE: /images/boards/tbeam-v1-pinout.jpg — Photo with labelled pins and LoRa antenna -->

| Function | Pin |
|----------|-----|
| I2C SDA | GPIO 21 |
| I2C SCL | GPIO 22 |
| Secondary I2C SDA | GPIO 13 |
| Secondary I2C SCL | GPIO 14 |
| UART2 RX | GPIO 16 |
| UART2 TX | GPIO 17 |
| LoRa | SX1276 (built-in) |

**Notes:** Built-in 18650 battery holder, solar charge controller, GPS. LoRa SX1276 radio. AXP192 power management.

<!-- TODO: Full details from Board-Configurations.md -->

### T-Beam T3 S3 v1.2 (Lilygo)

<!-- IMAGE: /images/boards/tbeam-t3s3-pinout.jpg — Photo with labelled pins, LoRa antenna, and battery connector -->

| Function | Pin |
|----------|-----|
| I2C SDA (internal PMU) | GPIO 17 |
| I2C SCL (internal PMU) | GPIO 18 |
| I2C SDA (external sensors) | GPIO 45 |
| I2C SCL (external sensors) | GPIO 46 |
| UART2 RX | GPIO 16 |
| UART2 TX | GPIO 15 |
| LoRa | SX1262 (built-in) |

**Notes:** LiPo battery socket (not 18650 holder), solar charge controller, GPS. LoRa SX1262 radio (newer, better range than SX1276). AXP2101 power management. Primary I2C is hardwired to internal PMU — external sensors use the secondary bus on GPIO 45/46.

<!-- TODO: Full details from Board-Configurations.md -->

## Wiring Guides

### I2C Sensors

<!-- IMAGE: /images/diagrams/i2c-daisy-chain.svg — Diagram showing multiple I2C sensors daisy-chained -->

All I2C sensors connect the same way — daisy chain them to the SDA/SCL pins for your board (see tables above):

```
Board SDA  →  Sensor 1 SDA  →  Sensor 2 SDA  →  Sensor 3 SDA
Board SCL  →  Sensor 1 SCL  →  Sensor 2 SCL  →  Sensor 3 SCL
Board 3.3V →  Sensor 1 VCC  →  Sensor 2 VCC  →  Sensor 3 VCC
Board GND  →  Sensor 1 GND  →  Sensor 2 GND  →  Sensor 3 GND
```

### UART Sensors (PMS5003, C8 CO2)

<!-- IMAGE: /images/diagrams/uart-wiring.svg — Diagram showing UART TX/RX crossover -->

```
Board RX   →  Sensor TX
Board TX   →  Sensor RX
Board 5V   →  Sensor VCC   (must be 5V, not 3.3V!)
Board GND  →  Sensor GND
```

Note the TX/RX crossover — this is the most common wiring mistake.
