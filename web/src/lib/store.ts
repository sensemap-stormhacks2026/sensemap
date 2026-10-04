import { Pool } from "pg";
import { canonicalRoomId, ROOMS, getRoom } from "./rooms";
import { classifyReading } from "./scoring";
import type {
  ReadingInput,
  RoomWithReading,
  RoomsResponse,
} from "./types";

const SOUND_BASELINES = [48, 36, 31, 42, 28, 54, 38, 44, 34, 63, 29, 40, 46];
const LIGHT_BASELINES = [58, 52, 64, 47, 55, 43, 61, 51, 66, 72, 45, 49, 57];
const TEMP_BASELINES = [21.8, 21.2, 22.1, 21.5, 20.9, 22.4, 21.7, 21.9, 20.8, 23.2, 21.1, 22.0, 21.6];
const CROWD_RATIOS = [0.58, 0.34, 0.28, 0.46, 0.2, 0.65, 0.4, 0.32, 0.24, 0.72, 0.27, 0.53, 0.38];

type MemoryState = {
  latest: Map<string, ReadingInput>;
  histories: Map<string, number[]>;
  received: Set<string>;
};

const globalStore = globalThis as typeof globalThis & {
  sensemapStore?: MemoryState;
  sensemapPool?: Pool;
};

function simulatedReading(index: number): ReadingInput {
  const room = ROOMS[index];
  const sound = SOUND_BASELINES[index] ?? 45;
  const light = LIGHT_BASELINES[index] ?? 50;
  const temp = TEMP_BASELINES[index] ?? 21.5;
  const crowdRatio = CROWD_RATIOS[index] ?? 0.4;
  const tick = Date.now() / 10_000 + index * 1.7;
  return {
    timestamp: new Date().toISOString(),
    device_id: `demo-node-${index + 1}`,
    room_id: room.id,
    lux: Math.round((light + Math.sin(tick * 0.7) * 6) * 10) / 10,
    light_unit: "relative",
    sound_level: Math.round((sound + Math.sin(tick * 1.2) * 5) * 10) / 10,
    temperature_c: Math.round((temp + Math.sin(tick * 0.15) * 0.5) * 10) / 10,
    people_estimate: Math.max(
      0,
      Math.min(
        room.capacity,
        Math.round(room.capacity * crowdRatio + Math.sin(tick * 0.4) * 3),
      ),
    ),
    crowd_source: "simulated",
    crowd_devices_observed: 0,
    source: "simulated",
    quality: 1,
  };
}

function memory(): MemoryState {
  if (!globalStore.sensemapStore) {
    globalStore.sensemapStore = {
      latest: new Map(ROOMS.map((room, index) => [room.id, simulatedReading(index)])),
      histories: new Map(
        ROOMS.map((room, index) => [
          room.id,
          Array.from({ length: 16 }, (_, point) =>
            Math.round(
              (SOUND_BASELINES[index] ?? 45) + Math.sin(point * 0.65 + index) * 8,
            ),
          ),
        ]),
      ),
      received: new Set(),
    };
  }
  globalStore.sensemapStore.received ??= new Set();
  return globalStore.sensemapStore;
}

function pool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!globalStore.sensemapPool) {
    globalStore.sensemapPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      max: 3,
      connectionTimeoutMillis: 4_000,
    });
  }
  return globalStore.sensemapPool;
}

export async function saveReading(reading: ReadingInput): Promise<"tiger" | "demo"> {
  const room = getRoom(reading.room_id);
  if (!room) throw new Error(`Unknown room: ${reading.room_id}`);
  const canonicalReading = {
    ...reading,
    room_id: canonicalRoomId(reading.room_id),
  };

  const state = memory();
  state.latest.set(canonicalReading.room_id, canonicalReading);
  state.received.add(canonicalReading.room_id);
  const history = state.histories.get(canonicalReading.room_id) ?? [];
  state.histories.set(
    canonicalReading.room_id,
    [...history.slice(-15), Math.round(canonicalReading.sound_level)],
  );

  const db = pool();
  if (!db) return "demo";
  await db.query(
    `INSERT INTO rooms
      (id, name, building, floor, latitude, longitude, area_m2, capacity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       building = EXCLUDED.building,
       floor = EXCLUDED.floor,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       area_m2 = EXCLUDED.area_m2,
       capacity = EXCLUDED.capacity`,
    [
      room.id,
      room.name,
      room.building,
      room.floor,
      room.latitude,
      room.longitude,
      room.areaM2,
      room.capacity,
    ],
  );
  await db.query(
    `INSERT INTO readings
      (time, device_id, room_id, lux, light_unit, sound_level, temperature_c,
       people_estimate, crowd_source, crowd_devices_observed, source, quality)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      canonicalReading.timestamp,
      canonicalReading.device_id,
      canonicalReading.room_id,
      canonicalReading.lux,
      canonicalReading.light_unit,
      canonicalReading.sound_level,
      canonicalReading.temperature_c,
      canonicalReading.people_estimate,
      canonicalReading.crowd_source,
      canonicalReading.crowd_devices_observed,
      canonicalReading.source,
      canonicalReading.quality,
    ],
  );
  return "tiger";
}

function memoryResponse(): RoomsResponse {
  const state = memory();
  const rooms: RoomWithReading[] = ROOMS.map((room, index) => {
    let input = state.latest.get(room.id) ?? simulatedReading(index);
    if (input.source === "simulated" && !state.received.has(room.id)) {
      input = simulatedReading(index);
      state.latest.set(room.id, input);
      const trend = state.histories.get(room.id) ?? [];
      state.histories.set(
        room.id,
        [...trend.slice(-15), Math.round(input.sound_level)],
      );
    }
    return {
      ...room,
      reading: classifyReading(input, room),
      trend: state.histories.get(room.id) ?? [],
    };
  });

  return { rooms, storage: "demo", generated_at: new Date().toISOString() };
}

export async function getRoomsWithReadings(): Promise<RoomsResponse> {
  const db = pool();
  if (!db) return memoryResponse();

  try {
    const result = await db.query<ReadingInput>(
      `SELECT DISTINCT ON (room_id)
         time AS timestamp, device_id, room_id, lux, light_unit, sound_level,
         temperature_c, people_estimate, crowd_source,
         crowd_devices_observed, source, quality
       FROM readings
       ORDER BY room_id, time DESC`,
    );
    if (result.rows.length === 0) return memoryResponse();
    const byRoom = new Map(
      result.rows.map((row) => [
        row.room_id,
        { ...row, timestamp: new Date(row.timestamp).toISOString() },
      ]),
    );
    const fallback = memoryResponse();
    return {
      rooms: fallback.rooms.map((item) => {
        const input = byRoom.get(item.id);
        return input
          ? { ...item, reading: classifyReading(input, item) }
          : item;
      }),
      storage: "tiger",
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[sensemap] Tiger Data unavailable, using demo store", error);
    return memoryResponse();
  }
}
