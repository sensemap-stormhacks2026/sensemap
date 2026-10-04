export type DataSource = "live" | "estimated" | "simulated";
export type Level = "low" | "moderate" | "high";

export interface ReadingInput {
  timestamp: string;
  device_id: string;
  room_id: string;
  lux: number;
  light_unit: "lux" | "relative";
  sound_level: number;
  temperature_c: number;
  people_estimate: number;
  crowd_source: "manual" | "ble" | "simulated";
  crowd_devices_observed: number;
  source: DataSource;
  quality: number;
}

export interface Room {
  id: string;
  name: string;
  shortName: string;
  building: string;
  floor: number;
  latitude: number;
  longitude: number;
  areaM2: number;
  capacity: number;
}

export interface RoomReading extends ReadingInput {
  light_status: Level;
  sound_status: Level;
  temperature_status: Level;
  crowd_status: Level;
  crowd_ratio: number;
  density: number;
  suitability_score: number;
  stale: boolean;
}

export interface RoomWithReading extends Room {
  reading: RoomReading;
  trend: number[];
}

export interface RoomsResponse {
  rooms: RoomWithReading[];
  storage: "tiger" | "demo";
  generated_at: string;
}
