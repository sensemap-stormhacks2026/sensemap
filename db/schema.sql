CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  building_code TEXT NOT NULL DEFAULT '',
  building TEXT NOT NULL,
  floor INTEGER NOT NULL DEFAULT 1,
  room_number TEXT NOT NULL DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  area_m2 DOUBLE PRECISION NOT NULL CHECK (area_m2 > 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  hours TEXT NOT NULL DEFAULT 'Hours not verified',
  outlets BOOLEAN NOT NULL DEFAULT FALSE,
  verification TEXT NOT NULL DEFAULT 'provisional'
    CHECK (verification IN ('listed', 'provisional')),
  data_note TEXT
);

CREATE TABLE IF NOT EXISTS readings (
  time TIMESTAMPTZ NOT NULL,
  device_id TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  lux DOUBLE PRECISION NOT NULL,
  light_unit TEXT NOT NULL DEFAULT 'lux'
    CHECK (light_unit IN ('lux', 'relative')),
  sound_level DOUBLE PRECISION NOT NULL,
  temperature_c DOUBLE PRECISION NOT NULL,
  people_estimate INTEGER NOT NULL,
  crowd_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (crowd_source IN ('manual', 'ble', 'simulated')),
  crowd_devices_observed INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('live', 'estimated', 'simulated')),
  quality DOUBLE PRECISION NOT NULL CHECK (quality >= 0 AND quality <= 1)
) WITH (
  tsdb.hypertable,
  tsdb.segmentby = 'room_id',
  tsdb.orderby = 'time DESC'
);

CREATE INDEX IF NOT EXISTS readings_room_time_idx ON readings (room_id, time DESC);

ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS light_unit TEXT NOT NULL DEFAULT 'lux';

ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS crowd_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE readings
  ADD COLUMN IF NOT EXISTS crowd_devices_observed INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS building_code TEXT NOT NULL DEFAULT '';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_number TEXT NOT NULL DEFAULT '';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS hours TEXT NOT NULL DEFAULT 'Hours not verified';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS outlets BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS verification TEXT NOT NULL DEFAULT 'provisional';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS data_note TEXT;

INSERT INTO rooms (
  id, name, building_code, building, floor, room_number, latitude, longitude,
  area_m2, capacity, hours, outlets, verification, data_note
)
VALUES
  ('sub-2310', 'SUB Dining Area 2310', 'SUB', 'Student Union Building', 2, '2310', 49.27942, -122.92272, 278.7, 150, '9am–10pm', FALSE, 'listed', NULL),
  ('sub-2330', 'SUB Public Lounge 2330', 'SUB', 'Student Union Building', 2, '2330', 49.27942, -122.92232, 92.9, 50, '9am–10pm', FALSE, 'listed', NULL),
  ('sub-4210', 'SUB Public Lounge 4210', 'SUB', 'Student Union Building', 4, '4210', 49.27958, -122.92252, 92.9, 50, '9am–10pm', TRUE, 'listed', NULL),
  ('sub-4215', 'SUB Public Lounge 4215', 'SUB', 'Student Union Building', 4, '4215', 49.27958, -122.92225, 44.6, 24, '9am–10pm', TRUE, 'listed', NULL),
  ('sub-4100', 'SUB Public Lounge 4100', 'SUB', 'Student Union Building', 4, '4100', 49.27958, -122.92279, 18.6, 10, '9am–10pm', TRUE, 'listed', NULL),
  ('sub-4300', 'SUB Public Lounge 4300', 'SUB', 'Student Union Building', 4, '4300', 49.27974, -122.92268, 37.2, 20, '9am–10pm', TRUE, 'listed', NULL),
  ('sub-5300', 'SUB Public Lounge 5300', 'SUB', 'Student Union Building', 5, '5300', 49.27974, -122.92236, 92.9, 50, '9am–10pm', TRUE, 'listed', NULL),
  ('aq-303', 'AQ Public Lounge 303', 'AQ', 'Academic Quadrangle', 3, '303', 49.27820, -122.91972, 130.1, 70, '9am–10pm', TRUE, 'listed', NULL),
  ('wmc-1500', 'WMC Public Study Area 1500', 'WMC', 'West Mall Centre', 1, '1500', 49.27847, -122.92355, 92.9, 50, 'All day', TRUE, 'provisional', 'Confirm all-day access.'),
  ('aq-3169', 'Mackenzie Café', 'AQ', 'Academic Quadrangle', 3, '3169', 49.27823, -122.91920, 130.1, 70, '8:30am–2:30pm', TRUE, 'provisional', 'Workbook room and hours require verification.'),
  ('asb-9702', 'ASB Public Lounge 9702', 'ASB', 'Applied Sciences Building', 9, '9702', 49.27802, -122.91502, 27.9, 15, 'All day', TRUE, 'provisional', 'Floor and all-day access were inferred.'),
  ('asb-9703', 'ASB Public Lounge 9703', 'ASB', 'Applied Sciences Building', 9, '9703', 49.27816, -122.91478, 27.9, 15, 'All day', TRUE, 'provisional', 'Capacity copied from adjacent room; verify capacity, floor, and access.'),
  ('mbc-2270', 'Black Student Centre Lounge', 'MBC', 'Maggie Benston Centre', 2, '2270', 49.27915, -122.92145, 126.3, 68, 'All day', TRUE, 'provisional', 'Confirm all-day access.')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  building_code = EXCLUDED.building_code,
  building = EXCLUDED.building,
  floor = EXCLUDED.floor,
  room_number = EXCLUDED.room_number,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  area_m2 = EXCLUDED.area_m2,
  capacity = EXCLUDED.capacity,
  hours = EXCLUDED.hours,
  outlets = EXCLUDED.outlets,
  verification = EXCLUDED.verification,
  data_note = EXCLUDED.data_note;
