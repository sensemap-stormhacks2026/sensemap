# SenseMap pitch

## One sentence

SenseMap helps students find a quiet, comfortable, well-lit, uncrowded study
space using privacy-first live sensors and an interactive 3D campus map.

## 90-second stage pitch

Students know this experience: you walk across campus to the library, only to
find it loud, crowded, or too warm to focus. Room schedules do not tell you what
a space feels like right now.

SenseMap does. Our Raspberry Pi node measures light, relative sound, and
temperature. We combine those readings with a privacy-preserving crowd estimate
and the room's real capacity. The dashboard turns each signal into an
explainable condition and a 0–100 study suitability score.

On the 3D SFU map, students can immediately filter for quiet, comfortable, or
uncrowded spaces. Every value shows whether it is live, estimated, or simulated,
and when it was last updated. We do not store phone MAC addresses.

Under the map is a Python hardware agent, a Next.js real-time API, a Tiger Data
time-series hypertable, and an optional Gemini guide that explains the best
choice without replacing our transparent scoring.

Today, one node proves the complete system. At campus scale, inexpensive nodes
and privacy-preserving aggregate occupancy data could help students use existing
space better and help facilities understand where comfort improvements matter.

SenseMap turns campus ambience from a guess into something students can see.

## Judge questions

**Is Wi-Fi counting accurate?**  
Unique MAC counting is not accurate because modern phones randomize addresses.
Our prototype labels crowding as estimated and stores no MACs. A deployment
would use aggregate access-point telemetry or non-identifying doorway counters.

**Is the sound value in decibels?**  
No. It is relative amplitude on a calibrated 0–100 room scale. True dB reporting
requires calibration against a sound-level meter.

**Why Tiger Data?**  
Sensor readings are time-series data. A hypertable stores high-frequency writes
and supports fast room/time queries using standard PostgreSQL.

**Where does Gemini matter?**  
Gemini converts trusted, computed conditions into a concise recommendation and
caveat. Deterministic scoring remains authoritative, so the product still works
without AI.

**How does this support sustainability?**  
It helps people use existing shared spaces more effectively and surfaces
comfort problems before expanding physical capacity, aligning with the
inclusive and sustainable-space intent of UN SDG 11.
