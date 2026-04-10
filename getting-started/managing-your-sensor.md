# Managing Your Sensor

Once your sensor is deployed, you can manage it remotely via MQTT commands — calibrate sensors, check status, update location, and restart the device without physical access.

## Command Topic Structure

Commands are sent to your device's MQTT topic:

```
{deviceTopicPrefix}/command/{category}/{target}/{action}
```

For example:
```
wesense/v2/wifi/nz/wko/device123/command/sensor/scd4x/calibrate
```

All command responses are published to:
```
{deviceTopicPrefix}/status/command
```

Responses include a status (`SUCCESS`, `ERROR`, or `INFO`), a message, and a timestamp.

## Sensor Commands

### CO2 Sensors

#### SCD30 / SCD4x (Sensirion)

| Command | Action | Payload |
|---------|--------|---------|
| `sensor/scd4x/calibrate` | Calibrate to known CO2 level | PPM value (e.g. `400` for outdoor air) |
| `sensor/scd4x/asc_enable` | Enable Automatic Self-Calibration | — |
| `sensor/scd4x/asc_disable` | Disable ASC | — |
| `sensor/scd4x/asc_status` | Check ASC status | — |
| `sensor/scd4x/reset` | Reset sensor | — |
| `sensor/scd4x/selftest` | Run self-test | — |
| `sensor/scd4x/factory_reset` | Factory reset (wipes all calibration) | — |
| `sensor/scd4x/pressure_compensation_status` | Check pressure compensation | — |
| `sensor/scd4x/pressure_compensation_apply` | Apply pressure compensation | — |

The same commands are available for `scd30` (replace `scd4x` with `scd30` in the topic). The SCD30 also supports:

| Command | Action | Payload |
|---------|--------|---------|
| `sensor/scd30/set_interval` | Set measurement interval | Seconds (2-1800) |
| `sensor/scd30/set_altitude` | Set altitude compensation | Metres |
| `sensor/scd30/status` | Get sensor status | — |

#### CM1106-C

| Command | Action | Payload |
|---------|--------|---------|
| `sensor/cm1106c/calibrate` | Calibrate to known CO2 level | PPM value (400-1500) |
| `sensor/cm1106c/abc_enable` | Enable Automatic Baseline Correction | — |
| `sensor/cm1106c/abc_disable` | Disable ABC | — |
| `sensor/cm1106c/status` | Check sensor status | — |
| `sensor/cm1106c/serial_number` | Read serial number | — |
| `sensor/cm1106c/version` | Read firmware version | — |

### Air Quality

| Command | Action | Payload |
|---------|--------|---------|
| `sensor/sgp41/baseline_status` | Check VOC/NOx baseline learning status | — |
| `sensor/bme680/gas_heater` | Enable/disable gas heater | `ON` or `OFF` |

### Pressure

| Command | Action | Payload |
|---------|--------|---------|
| `sensor/bmp280/diagnostic` | Run diagnostic test | — |

## Device Commands

### LED Control

| Command | Action | Payload |
|---------|--------|---------|
| `device/led/set` | Control status LED | `ON`, `OFF`, `BLINK_FAST`, `BLINK_SLOW` |

### Location

| Command | Action | Payload |
|---------|--------|---------|
| `device/config/location` | Update sensor location | JSON: `{"latitude": -36.8, "longitude": 174.7, "name": "Auckland", "enable": true}` |
| `device/config/location_status` | Check current location | — |
| `device/config/location_reset` | Reset to firmware defaults | — |

This lets you move a sensor to a new location without reflashing the firmware.

## System Commands

| Command | Action | Payload |
|---------|--------|---------|
| `system/restart` | Restart the device | — (3-second delay for safety) |
| `system/status` | Get uptime, memory, connectivity | — |
| `system/syslog_enable` | Enable remote syslog | — |
| `system/syslog_disable` | Disable remote syslog | — |
| `system/syslog_status` | Check syslog status | — |

## Calibration Management

| Command | Action | Payload |
|---------|--------|---------|
| `system/calibration_status` | Status of all sensors' calibration | — |
| `system/calibration_reset` | Reset calibration state | `all` or sensor name (e.g. `scd4x`) |
| `system/calibration_restart` | Reset and restart calibration | `all` or sensor name |
| `system/calibration_backup` | Backup calibration data to MQTT | — |
| `system/calibration_restore` | Restore from backup | JSON calibration payload |
| `system/testing_enable` | Suppress ALL data (testing mode) | — |
| `system/testing_disable` | Resume normal publishing | — |

## Sending Commands

You can send commands using any MQTT client. Here's an example using `mosquitto_pub`:

```bash
# Calibrate SCD4x to outdoor air (400 ppm)
mosquitto_pub -h mqtt.wesense.earth -p 8883 \
  --capath /etc/ssl/certs \
  -u "your_user" -P "your_password" \
  -t "wesense/v2/wifi/nz/wko/device123/command/sensor/scd4x/calibrate" \
  -m "400"

# Check system status
mosquitto_pub -h mqtt.wesense.earth -p 8883 \
  --capath /etc/ssl/certs \
  -u "your_user" -P "your_password" \
  -t "wesense/v2/wifi/nz/wko/device123/command/system/status" \
  -m ""
```

You can also use MQTT Explorer, Home Assistant's MQTT integration, or any MQTT dashboard to send commands and view responses.

## CO2 Calibration Tips

### SCD30 / SCD4x — When to Calibrate

- **Recommended approach**: Enable ASC and place the sensor where it gets at least 1 hour of fresh air (~400ppm) daily. ASC takes 7 days to find its initial baseline.
- **Manual calibration**: Place the sensor outdoors in fresh air for 2+ minutes, then send the calibrate command with `400` as the payload.
- **Never calibrate indoors** — indoor CO2 varies too much for a reliable reference point.

### CM1106-C — ABC Considerations

- ABC is **disabled by default** — the sensor uses factory calibration on startup.
- Only enable ABC if the sensor regularly sees outdoor air (~400ppm).
- ABC uses a 15-day cycle (vs 7 days for SCD4x).
- Incorrect ABC setup can cause a persistent 50-100ppm offset.

## Remote Debug via Telnet

If you enabled Secure Telnet in the [firmware configuration](/getting-started/firmware-configuration), you can connect to your sensor's serial output remotely:

```bash
telnet <sensor-ip-address> 23
```

This shows the same output as the Arduino IDE Serial Monitor — sensor readings, connection status, errors, and calibration state. Useful for diagnosing issues without physical access.
