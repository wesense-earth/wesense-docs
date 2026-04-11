# Firmware Updates

Updating your WeSense sensor firmware is done by reflashing over USB using the Arduino IDE — the same process as the initial flash.

## Before You Update

1. **Keep a copy of your configuration** — note your settings in `credentials.h` and `wesense-sensor-firmware.ino` (WiFi credentials, location, sensor settings, etc.). You'll need to re-apply these to the new firmware before flashing.
2. **Pull the latest firmware** from the [wesense-sensor-firmware repository](https://github.com/wesense-earth/wesense-sensor-firmware)
3. **Apply your configuration** to the new firmware files — copy across your WiFi credentials, location, deployment type, and any other settings you changed from the defaults

Calibration data (e.g. CO2 sensor calibration that takes 7 days) is stored in NVS on the device and is designed to survive firmware updates. However, this capability is still being evaluated for reliability — see [Firmware Configuration](/getting-started/firmware-configuration) for details.

## Flash the Update

1. Open the updated `wesense-sensor-firmware.ino` in Arduino IDE
2. Verify your Arduino IDE settings are correct (see [Firmware Setup](/getting-started/firmware-setup)):
   - Board type matches your hardware
   - **Partition Scheme** set to **Minimal SPIFFS**
   - **USB CDC On Boot** enabled (C3/C6/S3 boards)
3. Connect your sensor via USB
4. Click **Upload**

The new firmware overwrites the previous version. Your sensor will restart automatically after flashing.

## Verify It's Working

Open the **Serial Monitor** (115200 baud) and check:

- WiFi connects successfully
- MQTT connects to your configured broker
- All expected sensors are detected
- Readings are being published

::: warning Don't leave it on your desk too long
It's good practice to check the serial output for a few minutes to confirm everything is working. However, don't leave your sensor running indoors for more than about 5 minutes if it's configured as an outdoor sensor — it will start sending indoor readings (e.g. your warm office temperature) to the archive under your outdoor location. With enough nodes in a region the network can handle occasional anomalies, but if you're the only node in your area this will show as incorrect data. Flash, verify, and redeploy promptly.
:::

## Reconnect and Redeploy

Once you've confirmed the update is working:

1. Disconnect the USB cable
2. Return the sensor to its deployment location
3. Power it on — it will reconnect to WiFi and MQTT automatically
4. Check the [live map](https://map.wesense.earth) to confirm data is flowing

## Update Frequency

There's no fixed update schedule. Check the [firmware repository](https://github.com/wesense-earth/wesense-sensor-firmware) for new releases. Updates typically include new sensor support, bug fixes, and protocol improvements. The firmware will never update itself automatically — you're always in control of when to update.
