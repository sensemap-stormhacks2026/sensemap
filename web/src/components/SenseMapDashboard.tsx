"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CampusView from "./CampusView";
import { createDemoSnapshot } from "@/lib/demo-snapshot";
import { scoreLabel } from "@/lib/scoring";
import type { RoomsResponse, RoomWithReading } from "@/lib/types";

type Filter = "all" | "quiet" | "cool" | "uncrowded" | "outlets" | "live";
type Recommendation = {
  recommended_room: string;
  reason: string;
  caveat: string;
  powered_by: "gemini" | "deterministic";
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All spaces" },
  { id: "quiet", label: "Quiet" },
  { id: "cool", label: "Comfortable" },
  { id: "uncrowded", label: "Uncrowded" },
  { id: "outlets", label: "Outlets" },
  { id: "live", label: "Live node" },
];

function FilterBar({
  filter,
  onChange,
}: {
  filter: Filter;
  onChange: (value: Filter) => void;
}) {
  return (
    <div className="filters" aria-label="Filter study spaces">
      {FILTERS.map((item) => (
        <button
          key={item.id}
          className={filter === item.id ? "active" : ""}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ageLabel(timestamp: string) {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 1000),
  );
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 220;
  const height = 42;
  const min = Math.min(...values) - 3;
  const max = Math.max(...values) + 3;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / (max - min || 1)) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent sound trend">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function SourceBadge({ room }: { room: RoomWithReading }) {
  const { source, stale } = room.reading;
  return (
    <span className={`source-badge ${stale ? "stale" : source}`}>
      <i />
      {stale
        ? "Stale"
        : source === "live"
          ? "Live sensor"
          : source === "estimated"
            ? "Sensor + estimate"
            : "Demo data"}
    </span>
  );
}

function statusText(metric: string, status: string) {
  if (metric === "temperature") {
    return status === "moderate" ? "Comfortable" : status === "low" ? "Cool" : "Warm";
  }
  if (metric === "sound") {
    return status === "low" ? "Quiet" : status === "moderate" ? "Moderate" : "Noisy";
  }
  if (metric === "light") {
    return status === "low" ? "Dim" : status === "moderate" ? "Balanced" : "Bright";
  }
  return status[0].toUpperCase() + status.slice(1);
}

export default function SenseMapDashboard({
  initialData,
}: {
  initialData?: RoomsResponse;
}) {
  const [data, setData] = useState<RoomsResponse>(
    initialData ?? createDemoSnapshot(),
  );
  const [selectedId, setSelectedId] = useState("aq-303");
  const [filter, setFilter] = useState<Filter>("all");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [apiError, setApiError] = useState(false);

  const loadRooms = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/rooms", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unable to load room data");
      setData(await response.json());
      setApiError(false);
    } catch {
      setApiError(true);
      setData((current) => current ?? createDemoSnapshot());
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const loadRecommendation = useCallback(async () => {
    try {
      const response = await fetch("/api/recommend", { cache: "no-store" });
      if (response.ok) setRecommendation(await response.json());
    } catch {
      // The transparent deterministic room ranking remains visible.
    }
  }, []);

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void loadRooms();
      void loadRecommendation();
    }, 0);
    const interval = window.setInterval(loadRooms, 3_000);
    const recommendationInterval = window.setInterval(loadRecommendation, 30_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
      window.clearInterval(recommendationInterval);
    };
  }, [loadRecommendation, loadRooms]);

  const rooms = useMemo(() => data?.rooms ?? [], [data]);
  const selected = rooms.find((room) => room.id === selectedId) ?? rooms[0];
  const visibleRoomIds = useMemo(() => {
    return new Set(
      rooms
        .filter((room) => {
          if (filter === "quiet") return room.reading.sound_status === "low";
          if (filter === "cool") return room.reading.temperature_status === "moderate";
          if (filter === "uncrowded") return room.reading.crowd_status === "low";
          if (filter === "outlets") return room.outlets;
          if (filter === "live") {
            return room.reading.source !== "simulated" && !room.reading.stale;
          }
          return true;
        })
        .map((room) => room.id),
    );
  }, [filter, rooms]);
  const sortedRooms = [...rooms].sort(
    (a, b) => b.reading.suitability_score - a.reading.suitability_score,
  );
  const activeNodes = rooms.filter(
    (room) => room.reading.source !== "simulated" && !room.reading.stale,
  ).length;

  if (!data?.rooms?.length) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">S</div>
        <p>Connecting to SenseMap…</p>
        <button onClick={loadRooms}>Open demo rooms</button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <h1>SenseMap</h1>
            <p>SFU Burnaby · Live study conditions</p>
          </div>
        </div>
        <div className="topbar-status">
          <span className="network-status">
            <i />
            {activeNodes} live {activeNodes === 1 ? "node" : "nodes"} · {rooms.length} spaces
          </span>
          <span className="storage-status">{data.storage === "tiger" ? "Tiger Data" : "Demo store"}</span>
          <span className="updated-time">Updated {ageLabel(data.generated_at)}</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="spaces-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Explore campus</p>
              <h2>Find your focus</h2>
            </div>
            <span className="room-count">{visibleRoomIds.size}</span>
          </div>

          <FilterBar filter={filter} onChange={setFilter} />

          <div className="room-list">
            {sortedRooms
              .filter((room) => visibleRoomIds.has(room.id))
              .map((room) => (
                <button
                  key={room.id}
                  className={`room-card ${selected?.id === room.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(room.id)}
                >
                  <span className={`score-ring score-${scoreLabel(room.reading.suitability_score).toLowerCase().replace(" ", "-")}`}>
                    {room.reading.suitability_score}
                  </span>
                  <span className="room-copy">
                    <strong>{room.name}</strong>
                    <small>{room.building} · Floor {room.floor}</small>
                    <span className="room-tags">
                      <em>{statusText("sound", room.reading.sound_status)}</em>
                      <em>{Math.round(room.reading.crowd_ratio * 100)}% full</em>
                      {room.outlets && <em>Outlets</em>}
                    </span>
                  </span>
                  <span className="room-arrow">›</span>
                </button>
              ))}
            {visibleRoomIds.size === 0 && (
              <div className="empty-filter">No spaces match this filter right now.</div>
            )}
          </div>

          {recommendation && (
            <div className="ai-card">
              <div className="ai-card-title">
                <span>Sense guide</span>
                <i>{recommendation.powered_by === "gemini" ? "Gemini" : "Smart score"}</i>
              </div>
              <strong>{recommendation.recommended_room}</strong>
              <p>{recommendation.reason}</p>
              <small>{recommendation.caveat}</small>
            </div>
          )}
        </aside>

        <section className="map-panel">
          <div className="map-title">
            <div>
              <span className="live-pulse"><i />Live conditions</span>
              <h2>Burnaby Campus</h2>
            </div>
            <div className="map-controls-copy">
              <span>Drag to explore</span>
              <span>Scroll to zoom</span>
            </div>
          </div>
          <div className="map-filters">
            <FilterBar filter={filter} onChange={setFilter} />
          </div>
          <CampusView
            rooms={rooms}
            selectedId={selected?.id ?? ""}
            visibleRoomIds={visibleRoomIds}
            onSelect={setSelectedId}
          />
          {apiError && (
            <div className="connection-warning">Connection interrupted — showing last known conditions.</div>
          )}
        </section>

        {selected && (
          <aside className="detail-panel">
            <div className="detail-hero">
              <div className="detail-topline">
                <SourceBadge room={selected} />
                <span className="sensor-id">{selected.reading.device_id}</span>
              </div>
              <p className="eyebrow">{selected.building} · Floor {selected.floor}</p>
              <h2>{selected.name}</h2>
              <div className="hero-score">
                <strong>{selected.reading.suitability_score}</strong>
                <span><b>{scoreLabel(selected.reading.suitability_score)}</b>Study suitability</span>
              </div>
              <p className="freshness">Updated {ageLabel(selected.reading.timestamp)}</p>
            </div>

            <div className="space-facts">
              <div>
                <small>Room</small>
                <strong>{selected.roomNumber}</strong>
              </div>
              <div>
                <small>Listed hours</small>
                <strong>{selected.hours}</strong>
              </div>
              <div>
                <small>Power</small>
                <strong>{selected.outlets ? "Outlets available" : "No outlets listed"}</strong>
              </div>
              <div>
                <small>Room data</small>
                <strong>
                  {selected.verification === "listed" ? "Workbook listing" : "Provisional"}
                </strong>
              </div>
              {selected.dataNote && <p>{selected.dataNote}</p>}
            </div>

            <div className="metrics">
              <article>
                <span className="metric-icon">
                  {selected.reading.light_unit === "relative" ? "%" : "Lx"}
                </span>
                <div>
                  <small>Light</small>
                  <strong>
                    {Math.round(selected.reading.lux)}
                    {selected.reading.light_unit === "relative" ? "% relative" : " lux"}
                  </strong>
                </div>
                <em className={`level-${selected.reading.light_status}`}>
                  {statusText("light", selected.reading.light_status)}
                </em>
              </article>
              <article>
                <span className="metric-icon">Au</span>
                <div><small>Sound</small><strong>{Math.round(selected.reading.sound_level)} / 100</strong></div>
                <em className={`level-${selected.reading.sound_status}`}>
                  {statusText("sound", selected.reading.sound_status)}
                </em>
              </article>
              <article>
                <span className="metric-icon">°C</span>
                <div><small>Temperature</small><strong>{selected.reading.temperature_c.toFixed(1)}°C</strong></div>
                <em className={`level-${selected.reading.temperature_status}`}>
                  {statusText("temperature", selected.reading.temperature_status)}
                </em>
              </article>
              <article>
                <span className="metric-icon">Pp</span>
                <div><small>Crowd</small><strong>{selected.reading.people_estimate} / {selected.capacity}</strong></div>
                <em className={`level-${selected.reading.crowd_status}`}>
                  {statusText("crowd", selected.reading.crowd_status)}
                </em>
              </article>
            </div>

            <div className="trend-card">
              <div>
                <span><small>Sound trend</small><strong>Last 45 seconds</strong></span>
                <b>{statusText("sound", selected.reading.sound_status)}</b>
              </div>
              <Sparkline values={selected.trend} />
            </div>

            <div className="capacity-card">
              <div>
                <small>Occupancy estimate</small>
                <strong>{Math.round(selected.reading.crowd_ratio * 100)}%</strong>
              </div>
              <div className="capacity-track"><i style={{ width: `${selected.reading.crowd_ratio * 100}%` }} /></div>
              <p>
                {selected.reading.people_estimate} estimated people · {selected.areaM2} m² ·{" "}
                {selected.reading.density.toFixed(2)} people/m²
                {selected.reading.crowd_source === "ble" &&
                  ` · ${selected.reading.crowd_devices_observed} BLE signals observed`}
              </p>
            </div>

            <div className="data-note">
              <strong>Privacy-first estimate</strong>
              <p>
                {selected.reading.crowd_source === "ble"
                  ? "Bluetooth addresses are hashed in memory and discarded after each scan window."
                  : "No MAC addresses are stored. Crowd data is aggregate, manual, or simulated."}
              </p>
            </div>
          </aside>
        )}
      </section>
    </main>
  );
}
