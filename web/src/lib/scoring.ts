import type { Level, ReadingInput, Room, RoomReading } from "./types";

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export function classifyReading(reading: ReadingInput, room: Room): RoomReading {
  const crowdRatio = clamp(reading.people_estimate / room.capacity);
  const relativeLight = reading.light_unit === "relative";
  const lightStatus: Level =
    reading.lux < (relativeLight ? 30 : 150)
      ? "low"
      : reading.lux <= (relativeLight ? 70 : 500)
        ? "moderate"
        : "high";
  const soundStatus: Level =
    reading.sound_level < 35
      ? "low"
      : reading.sound_level <= 65
        ? "moderate"
        : "high";
  const temperatureStatus: Level =
    reading.temperature_c < 19
      ? "low"
      : reading.temperature_c <= 24
        ? "moderate"
        : "high";
  const crowdStatus: Level =
    crowdRatio < 0.35 ? "low" : crowdRatio <= 0.7 ? "moderate" : "high";

  const noiseComfort = 1 - clamp(reading.sound_level / 100);
  const crowdComfort = 1 - crowdRatio;
  const tempComfort = 1 - clamp(Math.abs(reading.temperature_c - 21.5) / 8);
  const lightComfort = relativeLight
    ? 1 - clamp(Math.abs(reading.lux - 50) / 50)
    : 1 - clamp(Math.abs(reading.lux - 400) / 600);
  const score = Math.round(
    (noiseComfort * 0.35 +
      crowdComfort * 0.3 +
      tempComfort * 0.2 +
      lightComfort * 0.15) *
      100,
  );

  return {
    ...reading,
    light_status: lightStatus,
    sound_status: soundStatus,
    temperature_status: temperatureStatus,
    crowd_status: crowdStatus,
    crowd_ratio: crowdRatio,
    density: reading.people_estimate / room.areaM2,
    suitability_score: score,
    stale: Date.now() - new Date(reading.timestamp).getTime() > 15_000,
  };
}

export function scoreLabel(score: number): "Best fit" | "Good fit" | "Limited" {
  if (score >= 75) return "Best fit";
  if (score >= 55) return "Good fit";
  return "Limited";
}
