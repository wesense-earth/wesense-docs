# Board Configurations

WeSense firmware supports multiple ESP32 board variants. The firmware auto-detects your board type at startup. This page provides detailed pin assignments and board-specific notes for each supported board.

## Supported Boards Overview

| Board | I2C | Dual I2C | UART | LoRa | Battery/Solar | USB CDC Required |
|-------|-----|----------|------|------|---------------|-----------------|
| ESP32 DevKit / WROOM-32 | 21/22 | Yes (13/14) | UART2 (16/17) | No | No | No |
| ESP32-C3 Generic | 4/5 | No (single controller) | UART1 (20/21) | No | No | Yes |
| ESP32-C6 Beetle / Generic | 19/20 | Yes (6/7) | UART1 (17/16) | No | No | Yes |
| ESP32-S3 Generic | 8/9 | Yes (17/18) | UART2 (44/43) | No | No | Yes |
| T-Beam v1.x (Lilygo) | 21/22 | Yes (13/14) | UART2 (16/17) | SX1276 | Yes | No |
| T-Beam T3 S3 v1.2 (Lilygo) | 45/46 | Yes (17/18 internal) | UART2 (16/15) | SX1262 | Yes | Yes |

---

## ESP32 DevKit / WROOM-32

The standard ESP32 development board. Widely available, cheapest option.

### Pin Assignments

| Function | Pin | Board Label |
|----------|-----|-------------|
| **I2C SDA** | GPIO 21 | D21 |
| **I2C SCL** | GPIO 22 | D22 |
| Secondary I2C SDA | GPIO 13 | D13 |
| Secondary I2C SCL | GPIO 14 | D14 |
| **UART2 RX** | GPIO 16 | D16 |
| **UART2 TX** | GPIO 17 | D17 |

### Sensor Wiring

```
ESP32 DevKit     →    I2C Sensors
─────────────         ────────────
GPIO 21 (SDA)    →    SDA
GPIO 22 (SCL)    →    SCL
3V3              →    VCC
GND              →    GND
```

```
ESP32 DevKit     →    PMS5003/C8
─────────────         ────────────
GPIO 16 (RX)     →    TX
GPIO 17 (TX)     →    RX
VIN (5V)         →    VCC
GND              →    GND
```

---

## ESP32-C3 Generic

Compact RISC-V board. Budget-friendly but has a single I2C controller limitation.

### Pin Assignments

| Function | Pin |
|----------|-----|
| **I2C SDA** | GPIO 4 |
| **I2C SCL** | GPIO 5 |
| Alt I2C SDA | GPIO 8 (same controller, different pins) |
| Alt I2C SCL | GPIO 9 (same controller, different pins) |
| **UART1 RX** | GPIO 20 |
| **UART1 TX** | GPIO 21 |
| Built-in LED | GPIO 8 |

### Important Notes

- **Single I2C controller** — unlike other ESP32 variants, the C3 cannot run two independent I2C buses. The alternative pins (8/9) use the same controller as the primary (4/5).
- **Uses UART1** (not UART2) — the firmware handles this automatically.
- **Requires USB CDC On Boot** enabled in Arduino IDE.

### Sensor Wiring

```
ESP32-C3         →    I2C Sensors
─────────────         ────────────
GPIO 4 (SDA)     →    SDA
GPIO 5 (SCL)     →    SCL
3V3              →    VCC
GND              →    GND
```

```
ESP32-C3         →    PMS5003/C8
─────────────         ────────────
GPIO 20 (RX)     →    TX
GPIO 21 (TX)     →    RX
VIN (5V)         →    VCC
GND              →    GND
```

### I2C Conflict Workarounds

Since you can't isolate sensors on separate buses:
- Use sensors with unique I2C addresses
- Keep I2C cable runs short (under 20cm)
- Add external 4.7k pull-up resistors if using longer cables
- If conflicts persist, consider upgrading to a C6 or S3 board

---

## ESP32-C6 Beetle (DFRobot) / Generic

WiFi 6 board with dual I2C. The Beetle variant is ultra-compact (23x28mm).

### Pin Layout (Beetle)

```
                    ESP32-C6 Beetle Mini
    ┌──────────────────────────────────────────────────────────┐
    │                      USB-C                               │
    │  ┌─────────────────────────────────────────────────┐     │
    │  │                                                 │     │
    │  │               DFRobot Logo                      │     │
    │  │                                                 │     │
    │  └─────────────────────────────────────────────────┘     │
    │                                                          │
    ├──────────────────────────────────────────────────────────┤
    │  VIN  │ GND │ 3V3 │ EN  │ 0   │ 1   │ 18  │ 8   │
    │  23   │ 9   │ 21  │ 22  │ 19  │ 20  │ 10  │ 11  │
    │       │     │     │     │ SDA │ SCL │ 4   │ 5   │
    │  12   │ 13  │ 14  │ 15  │ 16  │ 17  │ 6   │ 7   │
    │       │     │     │ LED │ TX  │ RX  │LP_SDA│LP_SCL│
    │  2    │ 3   │     │     │     │     │     │     │
    └──────────────────────────────────────────────────────────┘
```

### Pin Assignments

| Function | Pin | Label |
|----------|-----|-------|
| **I2C SDA** | GPIO 19 | SDA |
| **I2C SCL** | GPIO 20 | SCL |
| Secondary I2C SDA | GPIO 6 | LP_SDA |
| Secondary I2C SCL | GPIO 7 | LP_SCL |
| **UART1 RX** | GPIO 17 | RX |
| **UART1 TX** | GPIO 16 | TX |
| Built-in LED | GPIO 15 | LED |

### Important Notes

- **WiFi 6** (802.11ax) — more efficient than older WiFi standards.
- **Dual I2C controllers** — can isolate pressure sensors on the secondary bus.
- **Uses UART1** (not UART2) — firmware handles automatically.
- **Requires USB CDC On Boot** enabled in Arduino IDE.
- **Thread/Matter radio** built in (802.15.4) — not used by WeSense currently but future-ready.

### Boot Button Display Control

The boot button (GPIO 0) provides convenient display control:
- **Display timed out** (after 10 minutes): press to turn back on
- **Display active**: press to reset the 10-minute timeout

### Sensor Wiring

```
ESP32-C6         →    I2C Sensors
─────────────         ────────────
GPIO 19 (SDA)    →    SDA
GPIO 20 (SCL)    →    SCL
3V3              →    VCC
GND              →    GND
```

```
ESP32-C6         →    PMS5003/C8
─────────────         ────────────
GPIO 17 (RX)     →    TX
GPIO 16 (TX)     →    RX
VIN (5V)         →    VCC
GND              →    GND
```

---

## ESP32-S3 Generic

Higher-performance dual-core board with dual I2C.

### Pin Assignments

| Function | Pin |
|----------|-----|
| **I2C SDA** | GPIO 8 |
| **I2C SCL** | GPIO 9 |
| Secondary I2C SDA | GPIO 17 |
| Secondary I2C SCL | GPIO 18 |
| **UART2 RX** | GPIO 44 |
| **UART2 TX** | GPIO 43 |
| Built-in LED | GPIO 48 (common) |

### Important Notes

- **Dual-core** with enhanced processing power and 2MB+ RAM.
- **Dual I2C controllers** — can isolate sensors.
- **Requires USB CDC On Boot** enabled in Arduino IDE.

### Sensor Wiring

```
ESP32-S3         →    I2C Sensors
─────────────         ────────────
GPIO 8 (SDA)     →    SDA
GPIO 9 (SCL)     →    SCL
3V3              →    VCC
GND              →    GND
```

```
ESP32-S3         →    PMS5003/C8
─────────────         ────────────
GPIO 44 (RX)     →    TX
GPIO 43 (TX)     →    RX
VIN (5V)         →    VCC
GND              →    GND
```

---

## T-Beam v1.x (Lilygo)

Classic LoRaWAN board with built-in 18650 battery holder, solar charge controller, and GPS.

### Pin Assignments

| Function | Pin |
|----------|-----|
| **I2C SDA** | GPIO 21 |
| **I2C SCL** | GPIO 22 |
| Secondary I2C SDA | GPIO 13 |
| Secondary I2C SCL | GPIO 14 |
| **UART2 RX** | GPIO 16 |
| **UART2 TX** | GPIO 17 |
| GPS TX | GPIO 12 |
| GPS RX | GPIO 34 |
| Built-in LED | GPIO 4 |
| LoRa (SX1276) | SPI: SCK=5, MISO=19, MOSI=27, CS=18, RST=23, DIO0=26 |

### Key Features

- **SX1276 LoRa radio** — original LoRa chip, good range
- **AXP192 PMU** — battery charging, solar input, power monitoring via I2C
- **Built-in 18650 battery holder** — convenient but adds size
- **External battery connector** — also available if you prefer a different battery
- **GPS** — auto-detects location

### Important Notes

- The AXP192 PMU is on the primary I2C bus — external sensors share this bus.
- Does **not** require USB CDC On Boot (uses external USB-Serial chip).

### Sensor Wiring

```
T-Beam v1.x      →    I2C Sensors
─────────────         ────────────
GPIO 21 (SDA)    →    SDA
GPIO 22 (SCL)    →    SCL
3V3              →    VCC
GND              →    GND
```

```
T-Beam v1.x      →    PMS5003/C8
─────────────         ────────────
GPIO 16 (RX)     →    TX
GPIO 17 (TX)     →    RX
5V               →    VCC
GND              →    GND
```

---

## T-Beam T3 S3 v1.2 (Lilygo)

Newer LoRaWAN board with SX1262 radio, LiPo battery socket, solar charge controller, and GPS. The recommended LoRa board for new builds.

### Pin Assignments

| Function | Pin | Notes |
|----------|-----|-------|
| I2C SDA (internal) | GPIO 17 | Hardwired to AXP2101 PMU and OLED |
| I2C SCL (internal) | GPIO 18 | Hardwired to AXP2101 PMU and OLED |
| **I2C SDA (external sensors)** | GPIO 45 | Use this for your sensors |
| **I2C SCL (external sensors)** | GPIO 46 | Use this for your sensors |
| **UART2 TX** | GPIO 15 | |
| **UART2 RX** | GPIO 16 | |
| Built-in LED | GPIO 4 | |
| LoRa (SX1262) | SPI: SCK=5, MISO=3, MOSI=6, CS=7, RST=8, DIO1=33, BUSY=34 |

### Key Features

- **SX1262 LoRa radio** — newer generation, better range and lower power than SX1276 (despite the lower model number)
- **AXP2101 PMU** — battery charging, solar input, power monitoring
- **LiPo battery socket** — more compact than the 18650 holder on the v1.x, and you can connect any LiPo battery
- **GPS** — auto-detects location

### Important Notes

- **External sensors must use GPIO 45/46** — the primary I2C bus (17/18) is hardwired to internal components (PMU, OLED) and is not easily accessible for external sensors.
- **Requires USB CDC On Boot** enabled in Arduino IDE.

### Sensor Wiring

```
T-Beam T3 S3     →    I2C Sensors
─────────────         ────────────
GPIO 45 (SDA)    →    SDA          ← NOT GPIO 17!
GPIO 46 (SCL)    →    SCL          ← NOT GPIO 18!
3V3              →    VCC
GND              →    GND
```

```
T-Beam T3 S3     →    PMS5003/C8
─────────────         ────────────
GPIO 16 (RX)     →    TX
GPIO 15 (TX)     →    RX
5V/VBUS          →    VCC
GND              →    GND
```

---

## I2C Bus Isolation (Advanced)

If you experience stuck or erratic pressure sensor readings, you can isolate pressure sensors on the secondary I2C bus. This is supported on all boards with dual I2C controllers (everything except ESP32-C3).

Enable in firmware configuration:

```cpp
const bool ISOLATE_PRESSURE_SENSORS = true;
```

When enabled, the following sensors move to the secondary I2C bus:
- BMP390 (pressure)
- BMP280 (pressure)
- AHT20 (temperature/humidity backup)

All other sensors stay on the primary bus. The firmware auto-detects which bus each sensor is connected to.

### Secondary I2C Pin Summary

| Board | Secondary SDA | Secondary SCL |
|-------|--------------|--------------|
| ESP32 DevKit / WROOM-32 | GPIO 13 | GPIO 14 |
| T-Beam v1.x | GPIO 13 | GPIO 14 |
| T-Beam T3 S3 v1.2 | GPIO 45/46 are already the external bus |
| ESP32-S3 Generic | GPIO 17 | GPIO 18 |
| ESP32-C6 Beetle / Generic | GPIO 6 (LP_SDA) | GPIO 7 (LP_SCL) |
| ESP32-C3 Generic | Not supported (single I2C controller) | |

---

## General Wiring Tips

### I2C Daisy Chain

All I2C sensors connect to the same SDA/SCL pins in parallel:

```
Board SDA  ──┬── Sensor 1 SDA ──┬── Sensor 2 SDA ──┬── Sensor 3 SDA
Board SCL  ──┬── Sensor 1 SCL ──┬── Sensor 2 SCL ──┬── Sensor 3 SCL
Board 3.3V ──┬── Sensor 1 VCC ──┬── Sensor 2 VCC ──┬── Sensor 3 VCC
Board GND  ──┬── Sensor 1 GND ──┬── Sensor 2 GND ──┬── Sensor 3 GND
```

### UART TX/RX Crossover

UART sensors cross TX and RX — this is the most common wiring mistake:

```
Board RX  ──→  Sensor TX
Board TX  ──→  Sensor RX
Board 5V  ──→  Sensor VCC   (must be 5V, not 3.3V)
Board GND ──→  Sensor GND
```

### Power

- **I2C sensors**: 3.3V from the board's 3V3 pin
- **UART sensors** (PMS5003, C8 CO2): 5V from the board's VIN or 5V pin. Not all board designs break out a 5V pin — check your specific board.
- **CM1106-C CO2**: Requires 5V power (4.5-5.5V) but uses I2C at 3.3V logic levels
