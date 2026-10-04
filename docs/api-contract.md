# SenseMap MVP contract

The Raspberry Pi sends a reading every 2–5 seconds to `POST /api/readings`.
The dashboard polls `GET /api/rooms` every 3 seconds.

```json
{
  "timestamp": "2026-10-03T21:00:00.000Z",
  "device_id": "pi-demo-01",
  "room_id": "aq-3000",
  "lux": 52.1,
  "light_unit": "relative",
  "sound_level": 37.8,
  "temperature_c": 21.5,
  "people_estimate": 18,
  "source": "live",
  "quality": 1
}
```

`source` is one of `live`, `estimated`, or `simulated`. `light_unit` is `lux`
for a BH1750 or `relative` for the Grove Light Sensor. The historical `lux`
field carries either value so older clients remain compatible. `sound_level`
is a calibrated relative 0–100 amplitude unless the microphone has been
calibrated against a sound-level meter; it must not be presented as decibels.

MVP fallback rules:

1. A missing physical sensor uses the simulator behind the same Python reader.
2. A missing database uses the web server's in-memory demo store.
3. Crowd values are opt-in/estimated and no MAC address is sent or retained.
4. Data older than 15 seconds is shown as stale, never silently as live.
