# StormHacks submission package

## Project copy

**Name:** SenseMap  
**Tagline:** Find a better place to study, right now.

**Description:**  
SenseMap is a privacy-first, real-time ambience map for SFU Burnaby study
spaces. Raspberry Pi nodes measure light, relative sound, and temperature, then
combine those readings with capacity-normalized crowd estimates. An interactive
3D campus dashboard lets students filter for quiet, comfortable, or uncrowded
spaces and explains every recommendation. Tiger Data stores the time series,
Python runs the hardware node, and Gemini can summarize the best current option.

## Track opt-ins

- Best Hardware
- SSSS Python Track
- MLH Best Use of Tiger Data
- IATSU Best Design
- MLH Best Use of Gemini API, only when the API key is configured for judging
- Enactus SFU UNSDG Track, Goal 11
- Best Beginner, only if at least half the team is eligible
- Surge Choice Award

## Three-minute video shot list

1. **0:00–0:15 — Hook:** crowded campus B-roll and the question, “Where can I
   actually focus right now?”
2. **0:15–0:35 — Hardware:** close-up of the Pi and three sensors; identify each
   live measurement.
3. **0:35–1:10 — Live proof:** cover the light sensor and make noise; keep the Pi
   and dashboard in one frame while the values update.
4. **1:10–1:40 — Product:** rotate the 3D map, click a room, use Quiet and
   Uncrowded filters, and show capacity-normalized occupancy.
5. **1:40–2:05 — Intelligence:** show the transparent score, Tiger Data history,
   and Gemini recommendation/caveat.
6. **2:05–2:30 — Privacy:** show `live / estimated / simulated`, stale handling,
   and the “no MAC addresses stored” note.
7. **2:30–2:55 — Impact:** explain campus-scale nodes, better use of existing
   spaces, and UN SDG 11.
8. **2:55–3:00 — Close:** “SenseMap: find a better place to study, right now.”

## Before submitting

- Add the final GitHub URL.
- Add a deployed dashboard, Figma, or slide link if available.
- Record and upload the video; verify it is public/unlisted and under 3 minutes.
- Add two dashboard screenshots and one hardware photo to the submission.
- Confirm the physical room name, sensor models, team names, and track eligibility.
- Run the simulator backup once immediately before presenting.
- Keep `DEVICE_TOKEN`, `DATABASE_URL`, and `GEMINI_API_KEY` out of git.
