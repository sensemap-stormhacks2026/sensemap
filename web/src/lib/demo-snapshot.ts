import { ROOMS } from "./rooms";
import { classifyReading } from "./scoring";
import type { RoomsResponse } from "./types";

const SOUND_BASELINES = [48, 36, 31, 42, 28, 54, 38, 44, 34, 63, 29, 40, 46];
const LIGHT_BASELINES = [58, 52, 64, 47, 55, 43, 61, 51, 66, 72, 45, 49, 57];
const TEMP_BASELINES = [21.8, 21.2, 22.1, 21.5, 20.9, 22.4, 21.7, 21.9, 20.8, 23.2, 21.1, 22.6];
const CROWD_RATIOS = [0.58, 0.34, 0.28, 0.46, 0.2, 0.65, 0.4, 0.32, 0.24, 0.72, 0.27, 0.53, 0.38];

export function createDemoSnapshot(): RoomsResponse {
  const tick = Date.now() / 10_000;
  return {
    rooms: ROOMS.map((room, index) => {
      const sound = SOUND_BASELINES[index] ?? 45;
      const light = LIGHT_BASELINES[index] ?? 50;
      const temp = TEMP_BASELINES[index] ?? 21.5;
      const crowdRatio = CROWD_RATIOS[index] ?? 0.4;
      const wave = tick + index * 1.7;
      const input = {
        timestamp: new Date().toISOString(),
        device_id: `demo-node-${index + 1}`,
        room_id: room.id,
        lux: Math.round((light + Math.sin(wave * 0.7) * 6) * 10) / 10,
        light_unit: "relative" as const,
        sound_level: Math.round((sound + Math.sin(wave * 1.2) * 5) * 10) / 10,
        temperature_c: Math.round((temp + Math.sin(wave * 0.15) * 0.5) * 10) / 10,
        people_estimate: Math.max(
          0,
          Math.min(
            room.capacity,
            Math.round(room.capacity * crowdRatio + Math.sin(wave * 0.4) * 3),
          ),
        ),
        crowd_source: "simulated" as const,
        crowd_devices_observed: 0,
        source: "simulated" as const,
        quality: 1,
      };
      return {
        ...room,
        reading: classifyReading(input, room),
        trend: Array.from({ length: 16 }, (_, point) =>
          Math.round(sound + Math.sin(point * 0.65 + index) * 8),
        ),
      };
    }),
    storage: "demo",
    generated_at: new Date().toISOString(),
  };
}
