import { Pool } from "pg";
import { ROOMS, getRoom } from "./rooms";
import { classifyReading } from "./scoring";
import type {
  ReadingInput,
  RoomWithReading,
  RoomsResponse,
} from "./types";

const BASELINES = [
  { lux: 430, sound: 30, temp: 21.4, people: 18 },
  { lux: 360, sound: 44, temp: 22.2, people: 79 },
  { lux: 610, sound: 69, temp: 24.8, people: 88 },
  { lux: 285, sound: 57, temp: 20.6, people: 52 },
];

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
  const base = BASELINES[index];
  const tick = Date.now() / 10_000 + index * 1.7;
  return {
    timestamp: new Date().toISOString(),
    device_id: `demo-node-${index + 1}`,
    room_id: room.id,
    lux: Math.round(base.lux + Math.sin(tick * 0.7) * 35),
    light_unit: "lux",
    sound_level: Math.round((base.sound + Math.sin(tick * 1.2) * 5) * 10) / 10,
    temperature_c: Math.round((base.temp + Math.sin(tick * 0.15) * 0.5) * 10) / 10,
    people_estimate: Math.max(0, Math.round(base.people + Math.sin(tick * 0.4) * 5)),
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
            Math.round(BASELINES[index].sound + Math.sin(point * 0.65 + index) * 8),
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

  const state = memory();
  state.latest.set(reading.room_id, reading);
  state.received.add(reading.room_id);
  const history = state.histories.get(reading.room_id) ?? [];
  state.histories.set(
    reading.room_id,
    [...history.slice(-15), Math.round(reading.sound_level)],
  );

  const db = pool();
  if (!db) return "demo";
  await db.query(
    `INSERT INTO readings
      (time, device_id, room_id, lux, light_unit, sound_level, temperature_c,
       people_estimate, source, quality)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      reading.timestamp,
      reading.device_id,
      reading.room_id,
      reading.lux,
      reading.light_unit,
      reading.sound_level,
      reading.temperature_c,
      reading.people_estimate,
      reading.source,
      reading.quality,
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
         temperature_c, people_estimate, source, quality
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
