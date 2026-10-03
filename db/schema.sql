CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  building TEXT NOT NULL,
  floor INTEGER NOT NULL DEFAULT 1,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  area_m2 DOUBLE PRECISION NOT NULL CHECK (area_m2 > 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS readings (
  time TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  lux DOUBLE PRECISION NOT NULL,
  sound_level DOUBLE PRECISION NOT NULL,
  temperature_c DOUBLE PRECISION NOT NULL,
  people_estimate INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('live', 'estimated', 'simulated')),
  quality DOUBLE PRECISION NOT NULL CHECK (quality >= 0 AND quality <= 1)
) WITH (
  tsdb.hypertable,
  tsdb.segmentby = 'room_id',
  tsdb.orderby = 'time DESC'
);

CREATE INDEX IF NOT EXISTS readings_room_time_idx ON readings (room_id, time DESC);

INSERT INTO rooms (id, name, building, floor, latitude, longitude, area_m2, capacity)
VALUES
  ('aq-3000', 'AQ 3000 Study Commons', 'Academic Quadrangle', 3, 49.27820, -122.91972, 220, 80),
  ('wac-bennett', 'W.A.C. Bennett Library', 'W.A.C. Bennett Library', 3, 49.27920, -122.91824, 420, 140),
  ('asb-atrium', 'ASB Atrium', 'Applied Sciences Building', 1, 49.27807, -122.91490, 310, 110),
  ('sub-lounge', 'Student Union Lounge', 'Student Union Building', 2, 49.27954, -122.92252, 360, 125)
ON CONFLICT (id) DO NOTHING;
