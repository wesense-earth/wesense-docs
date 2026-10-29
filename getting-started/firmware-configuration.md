# Firmware Configuration

The firmware has two configuration files: `credentials.h` for network credentials and `wesense-sensor-firmware.ino` for everything else. This page walks through what each setting means.

## credentials.h — Network Credentials

### WiFi

```cpp
#define WIFI_SSID "YourWiFiNetwork"
#define WIFI_PASSWORD "YourWiFiPassword"
```

Your 2.4GHz WiFi network name and password. ESP32 does not support 5GHz networks.

### MQTT

```cpp
#define MQTT_SERVER "mqtt.wesense.earth"
#define MQTT_PORT 8883
#define MQTT_USE_TLS true
#define MQTT_USER "mqttuser"
#define MQTT_PASSWORD "mqttpassword"
```

| Setting | Default | Meaning |
|---------|---------|---------|
| `MQTT_SERVER` | `mqtt.wesense.earth` | The MQTT broker to connect to. Leave as default to send data to the WeSense network. Change to your own broker IP if running a local station. |
| `MQTT_PORT` | `8883` | 8883 for encrypted (MQTTS), 1883 for unencrypted. |
| `MQTT_USE_TLS` | `true` | Encrypts the MQTT connection. The firmware includes the ISRG Root X1 CA certificate (Let's Encrypt root, valid until 2035), so TLS works automatically with `mqtt.wesense.earth`. |
| `MQTT_USER` / `MQTT_PASSWORD` | — | Authentication credentials for the broker. |

For LAN-only deployments with self-signed certificates, you'll need to replace the CA cert in `ca_cert.h` with your own. This only needs to be done once — self-signed CAs are valid for 10 years.

### Remote Debug (Telnet)

In `credentials.h`:

```cpp
#define TELNET_PASS "your-own-password"
#define TELNET_ALLOWED_IP ""
```

Telnet is on by default (`ENABLE_SECURE_TELNET` in the sketch) and gives remote serial monitor access over your network. Set `TELNET_ALLOWED_IP` to restrict access to a single IP, or leave it empty to allow any device on your network.

`TELNET_PASS` is compiled into the firmware (a microcontroller has no environment variables, so `credentials.h` plays that role; it is kept out of git). The build **stops with an error** if `TELNET_PASS` is empty or still `CHANGE_THIS_PASSWORD` while telnet is enabled, because an empty password would let anyone log in by pressing Enter and the placeholder is public. To turn telnet off instead, set `ENABLE_SECURE_TELNET` to `false` in the sketch.

## wesense-sensor-firmware.ino — Device Settings

### Location

```cpp
const bool INCLUDE_LOCATION_IN_MQTT = true;
const float FIXED_LATITUDE = -36.8485;
const float FIXED_LONGITUDE = 174.7633;
```

| Setting | Meaning |
|---------|---------|
| `INCLUDE_LOCATION_IN_MQTT` | Must be `true` for the network to ingest your data. Without location, the system can't determine which region your readings belong to. |
| `FIXED_LATITUDE` / `FIXED_LONGITUDE` | Your location. Neighbourhood-level accuracy is sufficient — you can enter coordinates slightly offset from your actual position if you prefer. T-Beam boards with GPS determine location automatically and ignore these values. |

### Time Zone

```cpp
const long gmt_offset_sec = 43200;      // GMT+12 (New Zealand)
const int daylight_offset_sec = 3600;   // 1 hour daylight saving
```

Set to your local timezone offset in seconds. The firmware syncs time via NTP and uses this to display correct local time. Data is always stored in UTC regardless of this setting.

### Sensor Enable/Disable

Each sensor can be individually disabled. By default, all sensors are enabled and the firmware auto-detects which are physically connected.

```cpp
// Temperature/Humidity
const bool DISABLE_SHT4X = false;
const bool DISABLE_TMP117 = false;
const bool DISABLE_AHT20 = false;

// CO2
const bool DISABLE_SCD30 = false;
const bool DISABLE_SCD4X = false;
const bool DISABLE_CM1106C = false;

// Pressure
const bool DISABLE_MS5611 = false;
const bool DISABLE_BMP390 = false;
const bool DISABLE_BMP280 = false;

// Air Quality
const bool DISABLE_SGP41 = false;
const bool DISABLE_BME680 = false;

// Particulate Matter
const bool DISABLE_SPS30 = false;
const bool DISABLE_PMS5003 = false;

// Light / UV
const bool DISABLE_TSL2591 = false;
const bool DISABLE_LTR390 = false;
const bool DISABLE_BH1750 = false;

// Power / Noise
const bool DISABLE_INA226 = false;
const bool DISABLE_INA219 = false;
const bool DISABLE_INMP441 = false;
```

You only need to change these if you want to explicitly disable a sensor that's connected (e.g., to suppress a malfunctioning sensor without disconnecting it).

### Reading Intervals

```cpp
const unsigned long TEMP_HUMIDITY_INTERVAL_MS = 120000;  // 2 minutes
const unsigned long CO2_INTERVAL_MS = 60000;             // 1 minute
const unsigned long VOC_NOX_INTERVAL_MS = 90000;         // 1.5 minutes
const unsigned long PMS5003_INTERVAL_MS = 60000;         // 1 minute
const unsigned long PRESSURE_INTERVAL_MS = 180000;       // 3 minutes
const unsigned long INA219_INTERVAL_MS = 30000;          // 30 seconds
const unsigned long GPS_BATTERY_INTERVAL_MS = 900000;    // 15 minutes
```

How often each sensor type is read. The defaults are tuned for a good balance of data resolution and power consumption. The MQTT publish interval (every 5 minutes) batches these readings.

### CO2 Sensor Calibration

```cpp
const bool ENABLE_SCD30_ASC_BY_DEFAULT = false;
const bool USE_EXTERNAL_SENSORS_FOR_SCD30_COMPENSATION = false;

const bool ENABLE_SCD4X_ASC_BY_DEFAULT = false;

const bool ENABLE_CM1106C_ABC_BY_DEFAULT = false;
```

| Setting | Meaning |
|---------|---------|
| `ENABLE_SCD30_ASC_BY_DEFAULT` | Enable Automatic Self-Calibration for SCD30. Requires the sensor to see fresh outdoor air (~400ppm) for at least 1 hour daily. |
| `USE_EXTERNAL_SENSORS_FOR_SCD30_COMPENSATION` | Use the SHT4x for temperature/humidity compensation instead of the SCD30's internal sensors. |
| `ENABLE_SCD4X_ASC_BY_DEFAULT` | Same as above but for SCD40/41. |
| `ENABLE_CM1106C_ABC_BY_DEFAULT` | Enable Automatic Baseline Correction for CM1106-C. Only enable if the sensor regularly sees fresh air. |

These can also be toggled remotely via [MQTT commands](/getting-started/managing-your-sensor).

### Calibration State Tracking

```cpp
const bool ENABLE_CALIBRATION_STATE_TRACKING = true;
const bool SUPPRESS_DATA_DURING_CALIBRATION = true;
```

When enabled, the firmware tracks which sensors are still in their calibration warmup period and suppresses their data until calibration is complete. This prevents inaccurate readings from reaching the database during sensor warmup.

### I2C Bus Isolation (Advanced)

```cpp
const bool ISOLATE_PRESSURE_SENSORS = false;
```

If pressure sensor readings are stuck or erratic due to I2C bus interference, enable this to move pressure sensors to the secondary I2C bus. Only works on boards with dual I2C controllers (not ESP32-C3).

### LoRaWAN

```cpp
#define LORAWAN_REGION_AU915  // Australia/New Zealand
// #define LORAWAN_REGION_EU868  // Europe
// #define LORAWAN_REGION_US915  // North America
// #define LORAWAN_REGION_AS923  // Asia-Pacific

const unsigned long LORAWAN_TX_INTERVAL_MS = 1200000;  // 20 minutes
```

Uncomment the region that matches your location. The default WeSense TTN credentials are built into the firmware. The transmission interval defaults to 20 minutes — see the [Quick Start LoRaWAN section](/getting-started/quick-start#lorawan-no-wifi-needed) for guidance on adjusting this based on your gateway distance.

#### AU915 data rate compatibility (Australia / New Zealand)

AU915 enforces a 400 ms dwell-time limit, which caps the maximum payload per data rate. The firmware's V2 protobuf encoding packs ~35 bytes of header plus 7–9 bytes per sensor, so most realistic sensor sets fit comfortably at DR4 or better:

| Data Rate | Spreading Factor | Max Payload | V2 Sensors That Fit | Range    |
| --------- | ---------------- | ----------- | ------------------- | -------- |
| DR2       | SF10             | 11 bytes    | Header only         | Best     |
| DR3       | SF9              | 53 bytes    | 2 sensors           | Good     |
| DR4       | SF8              | 125 bytes   | 10 sensors          | Medium   |
| DR5       | SF7              | 222 bytes   | 12+ sensors (all)   | Shortest |

In practice this means even a marginal gateway link (DR4) can transmit a full WeSense node's worth of readings — temperature, humidity, CO2, VOC/NOx, particulates, pressure — in a single uplink. Devices choose data rate automatically via TTN's ADR (Adaptive Data Rate) based on link quality, so you don't normally configure this directly.
