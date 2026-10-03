# SenseMap

Find a better place to study, right now.

SenseMap is a privacy-first environmental map for SFU Burnaby. A Raspberry Pi
collects light, relative sound, and temperature data; the app combines those
readings with an aggregate crowd estimate and room capacity to show which study
spaces are quiet, comfortable, well lit, and available.

Built for StormHacks 2026.

## What works

- Interactive pitched 3D campus map with four demo study spaces
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
  --endpoint http://YOUR_LAPTOP_IP:3000/api/readings
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
| BH1750 light | 3.3V, GND, SDA, SCL (I²C) | Auto-detected |
| DHT22 temperature | 3.3V, GND, data to GPIO 4 with pull-up | Auto-detected |
| Analog sound module | Module output to MCP3008 CH0; MCP3008 over SPI | Auto-detected |

The Raspberry Pi has no analog input, so an analog sound sensor requires an
MCP3008/ADS1115 or a USB microphone. Change `DHT_PIN` and `MCP3008_CHANNEL` with
environment variables. If any driver or sensor is absent, only that metric uses
the simulator and the payload quality reflects the change.

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

- Light: dim below 150 lux, balanced from 150–500, bright above 500
- Relative sound: quiet below 35, moderate from 35–65, noisy above 65
- Temperature: cool below 19°C, comfortable from 19–24°C, warm above 24°C
- Crowd: low below 35% capacity, moderate from 35–70%, high above 70%
- Suitability: 35% noise, 30% crowd, 20% temperature, 15% light

Sound is shown as relative amplitude out of 100, **not decibels**. Reporting dB
would require calibration against a real sound-level meter.

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
optionally `GEMINI_API_KEY`. For a local-network demo, run `npm run dev -- -H
0.0.0.0` and point the Pi agent at the laptop's LAN address.

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
- Demo footprints are approximate and based on
  [SFU Facilities open mapping services](https://www.sfu.ca/fs/campus-maps/mapping-services.html)
- Wi-Fi counting limitations:
  [RateCount](https://arxiv.org/html/2507.03873v1)

This is a hackathon prototype, not an official SFU occupancy or safety system.