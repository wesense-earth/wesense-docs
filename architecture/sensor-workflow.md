# Sensor Workflow

## Sensor Startup Sequence

1. **Firmware:** The sensor has a list of Bootstrap Gateway URLs for initial discovery.
   
   ```cpp
   const char* BOOTSTRAP_URLS[] = {
     "https://bootstrap1.wesense.io/ingesters",
     "https://bootstrap2.wesense.io/ingesters",
     // Community can add more URLs here
   };
   ```
   
   **Decentralization note:** These URLs are convenience defaults, not central dependencies:
   
   - Firmware is open source - anyone can add/modify URLs in their build
   - Community members can run their own bootstrap gateways
   - Multiple redundant URLs prevent single points of failure
   - Once bootstrapped, OrbitDB handles ongoing discovery
   - If all defaults fail, users can manually configure an ingester endpoint

2. **HTTP GET:** On startup, the sensor requests the ingester list from any available bootstrap gateway.

3. **Select Ingester:** Sensor picks an ingester (preferably in same region for latency).

4. **Connect MQTT:** Establishes connection to the ingester's MQTT broker (or local broker).

5. **Publish Readings:** Publishes all readings to a single topic in v2 protobuf format:
   
   ```
   wesense/v2/nz/auk/office_301274c0e8fc
   ```
   
   All sensor measurements are consolidated into one v2 protobuf message (~35 bytes metadata + ~7 bytes per sensor).

## Sensor Firmware Configuration

```cpp
// WeSense Sensor Configuration (ISO 3166)
#define PROTOCOL_VERSION "v2"
#define COUNTRY_CODE "nz"        // ISO 3166-1 alpha-2 (lowercase)
#define SUBDIVISION_CODE "auk"   // ISO 3166-2 subdivision (lowercase)
#define DEVICE_LOCATION "office" // User-defined location name

char deviceID[48];  // Will be: office_301274c0e8fc

void generateDeviceID() {
  uint64_t chipid = ESP.getEfuseMac();
  snprintf(deviceID, sizeof(deviceID), "%s_%012llx", DEVICE_LOCATION, chipid);
}

// Build topic: wesense/v2/nz/auk/office_301274c0e8fc (all readings consolidated)
String buildTopic() {
  return String("wesense/") + PROTOCOL_VERSION + "/" +
         COUNTRY_CODE + "/" + SUBDIVISION_CODE + "/" + deviceID;
}

// Publish all readings in consolidated v2 protobuf format
void publishAllReadings() {
  // Use ProtobufEncoderV2 for compact binary encoding
  ProtobufEncoderV2 encoder;
  encoder.begin();

  // Add all sensor readings
  encoder.addTemperature(22.5, "sht4x");
  encoder.addHumidity(65.3, "sht4x");
  encoder.addCO2(412.0, "scd4x");
  encoder.addPressure(1013.25, "bmp280");
  encoder.addPM25(12.5, "pms5003");
  encoder.addVOC(125.0, "sgp41");

  // Encode to binary
  uint8_t buffer[256];
  size_t encoded_size = encoder.encode(buffer, sizeof(buffer));

  // Publish single message with all readings
  String topic = buildTopic();
  mqttClient.publish(topic.c_str(), buffer, encoded_size);
}
```

The v2 protobuf format is ~8-10x more bandwidth efficient than v1 JSON, making it suitable for both WiFi and LoRaWAN transports.
