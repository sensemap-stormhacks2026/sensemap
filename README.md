# SenseMap

Find a better place to study, right now.

SenseMap is a privacy-first environmental map for SFU Burnaby. A Raspberry Pi
collects light, relative sound, and temperature data; the app combines those
readings with an aggregate crowd estimate and room capacity to show which study
spaces are quiet, comfortable, well lit, and available.

Built for StormHacks 2026.

[![Watch a Demo!](https://youtu.be/3yypkkRLDLw?si=qmggN0L5ZNBuV6jB)](https://youtu.be/3yypkkRLDLw?si=qmggN0L5ZNBuV6jB)


## What works

- Interactive pitched 3D campus map with 13 workbook-backed study spaces
- Live Raspberry Pi ingestion every 2–5 seconds
- BH1750, DHT22, and MCP3008 sound-module support with per-sensor fallback
- Transparent Low / Moderate / High environmental classifications
- Explainable 0–100 study suitability score
- Capacity-normalized crowding and people-per-square-metre context
- Tiger Data/TimescaleDB storage with an automatic in-memory demo fallback
- Optional Gemini recommendation with a deterministic fallback
- Source, quality, freshness, stale, and simulated-data indicators
- Responsive dashboard, room filters, trends, and offline-safe demo data

## Architecture

```text
BH1750 + DHT22 + sound/ADC + crowd estimate
                       |
              Python Pi agent
                       |
           POST /api/readings (2–5s)
                       |
     Next.js API ── Tiger Data hypertable
                       |
             GET /api/rooms (3s)
                       |
         React + MapLibre 3D dashboard
                       |
        Gemini explanation (optional)
```

The shared payload is documented in [`docs/api-contract.md`](docs/api-contract.md).

## Quick start

### Dashboard

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The dashboard is fully usable without credentials:
it automatically runs with realistic, clearly marked simulated data.

### Raspberry Pi simulator

From the repository root:

```bash
python sensor/agent.py --simulate --once
python sensor/agent.py --simulate \
  --endpoint http://YOUR_LAPTOP_IP:3001/api/readings
```

The default development token is `sensemap-demo-token`. Set the same secure
value in `web/.env.local` as `DEVICE_TOKEN` and on the Pi as
`SENSEMAP_DEVICE_TOKEN` before deployment.

### Physical sensors

Install optional Pi drivers:

```bash
python -m pip install -r sensor/requirements-pi.txt
sudo raspi-config
```

Enable I²C and SPI, then reboot.

| Sensor | Raspberry Pi connection | Agent support |
|---|---|---|
| Grove Light Sensor v1.2 | Grove Base Hat analog socket A0/A1; channel 0 | Auto-detected as relative 0–100% |
| Grove Sound Sensor v1.6 | Grove Base Hat analog socket A2/A3; channel 2 | Auto-detected as relative amplitude |
| BH1750 light | 3.3V, GND, SDA, SCL (I²C) | Auto-detected |
| DHT22 temperature | 3.3V, GND, data to GPIO 4 with pull-up | Auto-detected |
| Analog sound module | Module output to MCP3008 CH0; MCP3008 over SPI | Auto-detected |

The Grove Base Hat supplies the ADC missing from the Raspberry Pi. It is detected
at I²C address `0x08` or `0x04`; override with `GROVE_ADC_ADDRESS=0x08` if needed.
Use `SENSEMAP_SENSOR_PROFILE=grove`, `GROVE_LIGHT_CHANNEL=0`, and
`GROVE_SOUND_CHANNEL=2` for the StormHacks node. If any sensor is absent, only
that metric uses the simulator and the payload quality reflects the change. Set
`SENSEMAP_TEMPERATURE_MODE=simulated` when no temperature sensor is connected.

### Study-space catalog

The dashboard contains the 13 spaces supplied in
`SFU_Burnaby_Study_Spots_Updated.xlsx`. Each room includes its building, floor,
room number, listed hours, capacity, estimated area, outlet availability,
coordinates, and a verification label. The workbook is source material; the
normalized catalog in `web/src/lib/rooms.ts` is what the running app uses. Room
dots use the workbook building coordinates with small offsets inside each
footprint so rooms remain clickable instead of overlapping.

Only the room containing the Pi is a live node. The other rooms receive clearly
labelled demo readings so every marker and filter works during the presentation.
Areas were estimated from capacity and are not official measurements. ASB floors,
ASB 9703 capacity, all-day access, and Mackenzie Café details remain provisional.

## Tiger Data

1. Create a Tiger Cloud service and copy its PostgreSQL connection string.
2. Run [`db/schema.sql`](db/schema.sql) in Tiger Cloud's SQL editor.
3. Set `DATABASE_URL` in `web/.env.local` and in the Vercel project.
4. Restart the app. The header changes from **Demo store** to **Tiger Data** when
   readings are served from the hypertable.

The app deliberately falls back to its in-memory store if the database is not
configured or temporarily unavailable, keeping the hardware demo reliable.

## Gemini

Set `GEMINI_API_KEY` to enable AI-generated study-space explanations. Gemini
receives only already-aggregated room conditions and must return structured JSON
with a recommendation, reason, and caveat. The deterministic score remains the
source of truth; without an API key, the same endpoint returns an explainable
non-AI recommendation.

## Scoring

- Lux light sensors: dim below 150 lux, balanced from 150–500, bright above 500
- Grove light sensor: dim below 30%, balanced from 30–70%, bright above 70%
- Relative sound: quiet below 35, moderate from 35–65, noisy above 65
- Temperature: cool below 19°C, comfortable from 19–24°C, warm above 24°C
- Crowd: low below 35% capacity, moderate from 35–70%, high above 70%
- Suitability: 35% noise, 30% crowd, 20% temperature, 15% light

Sound is shown as relative amplitude out of 100, **not decibels**. Reporting dB
would require calibration against a real sound-level meter.

### BLE crowd estimate

The Pi can estimate crowding from unique BLE advertisers in a disposable time
window. Enable it only where passive scanning is authorized:

```bash
export SENSEMAP_CROWD_MODE=ble
export BLE_SCAN_WINDOW=300
export BLE_MIN_RSSI=-70
export BLE_PEOPLE_FACTOR=0.8
```

For a faster demo, use `BLE_SCAN_WINDOW=60`. The scanner hashes addresses
immediately with a random per-window salt, retains only hashes in memory, and
discards the entire set when the window ends. The dashboard receives only the
aggregate advertiser count and estimated people count. Calibrate the factor as
`known people / observed advertisers`; `0.8` is only a starting assumption.

## Crowd estimation and privacy

SenseMap does not store MAC addresses, packet captures, phone identities, or
cross-window identifiers. Modern phones randomize Wi-Fi MAC addresses, so
counting unique addresses is not a reliable person count.

The hackathon demo supports an opt-in/aggregate estimate. A production version
should use privacy-preserving aggregate telemetry supplied by campus access
points, or non-identifying doorway sensors such as PIR/mmWave counters. Every
reading is labeled `live`, `estimated`, or `simulated`, and readings older than
15 seconds are marked stale.

## Deploy

The `web` directory is Vercel-ready:

```bash
cd web
npm run build
npx vercel
```

Set the project root to `web` and add `DATABASE_URL`, `DEVICE_TOKEN`, and
optionally `GEMINI_API_KEY`.

For the current local-network demo, run the dashboard on the laptop:

```bash
cd web
npm run dev -- -H 0.0.0.0 -p 3001
```

Then run the Pi node:

```bash
cd ~/sensemap
source .venv/bin/activate
export SENSEMAP_ENDPOINT=http://10.42.0.1:3001/api/readings
export SENSEMAP_ROOM_ID=aq-303
export SENSEMAP_TEMPERATURE_MODE=simulated
export SENSEMAP_CROWD_MODE=ble
export BLE_SCAN_WINDOW=60
export BLE_MIN_RSSI=-65
export BLE_PEOPLE_FACTOR=0.8
python sensor/agent.py
```

Replace `10.42.0.1` if the laptop has a different address. The API continues
to accept the previous `aq-3000` room ID and maps it to `aq-303`.

## Three-minute demo script

1. **0:00–0:20** — Students waste time searching for a suitable study space.
2. **0:20–1:10** — Cover the light sensor, make noise, and warm the temperature
   sensor; show the dashboard update within five seconds.
3. **1:10–1:45** — Filter for quiet/uncrowded rooms and open the recommendation.
4. **1:45–2:20** — Show Tiger Data history, the architecture, and privacy labels.
5. **2:20–2:50** — Explain the campus-scale vision and SDG 11 connection.

Record one simulator-backed run before presenting so the demo survives hardware
or venue-network failure.

## Suggested StormHacks tracks

- Best Hardware
- SSSS Python
- Best Use of Tiger Data
- IATSU Best Design
- Best Use of Gemini API, when configured
- Enactus UNSDG: Goal 11, better use of inclusive campus study spaces
- Best Beginner, if team eligibility is met

## Data and attribution

- Basemap © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
  and [OpenFreeMap](https://openfreemap.org/)
- Building outlines come from the
  [SFU Facilities Vertisee Building Overview](https://viewsfu.its.sfu.ca/fsgis/rest/services/Vertisee/Vertisee_BuildingFloorplan_I_2020/MapServer/1).
  Extrusion heights are prototype estimates because that service does not
  publish authoritative 3D heights.
- Wi-Fi counting limitations:
  [RateCount](https://arxiv.org/html/2507.03873v1)

This is a hackathon prototype, not an official SFU occupancy or safety system.
