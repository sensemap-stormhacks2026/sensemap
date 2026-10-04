"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CampusMap from "./CampusMap";
import { createDemoSnapshot } from "@/lib/demo-snapshot";
import { scoreLabel } from "@/lib/scoring";
import type { RoomsResponse } from "@/lib/types";

type Filter = "all" | "quiet" | "cool" | "uncrowded" | "outlets" | "live";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All spaces" },
  { id: "quiet", label: "Quiet" },
  { id: "cool", label: "Comfortable" },
  { id: "uncrowded", label: "Uncrowded" },
  { id: "outlets", label: "Outlets" },
  { id: "live", label: "Live node" },
];

const ROOM_PREVIEW_COUNT = 4;

function ageLabel(timestamp: string) {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 1000),
  );
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function statusText(metric: string, status: string) {
  if (metric === "temperature") {
    return status === "moderate" ? "Comfortable" : status === "low" ? "Cool" : "Warm";
  }
  if (metric === "sound") {
    return status === "low" ? "Quiet" : status === "moderate" ? "Moderate" : "Loud";
  }
  if (metric === "light") {
    return status === "low" ? "Dim" : status === "moderate" ? "Balanced" : "Bright";
  }
  return status[0].toUpperCase() + status.slice(1);
}

function scoreTone(score: number) {
  return scoreLabel(score).toLowerCase().replace(" ", "-");
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
  const [listExpanded, setListExpanded] = useState(false);
  const [apiError, setApiError] = useState(false);
  const mapSectionRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void loadRooms();
    }, 0);
    const interval = window.setInterval(loadRooms, 3_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [loadRooms]);

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
  const filteredRooms = useMemo(
    () =>
      [...rooms]
        .filter((room) => visibleRoomIds.has(room.id))
        .sort((a, b) => b.reading.suitability_score - a.reading.suitability_score),
    [rooms, visibleRoomIds],
  );
  const visibleRooms = listExpanded
    ? filteredRooms
    : filteredRooms.slice(0, ROOM_PREVIEW_COUNT);
  const hiddenCount = Math.max(0, filteredRooms.length - ROOM_PREVIEW_COUNT);
  const activeNodes = rooms.filter(
    (room) => room.reading.source !== "simulated" && !room.reading.stale,
  ).length;

  const changeFilter = (value: Filter) => {
    setFilter(value);
    setListExpanded(false);
  };

  const chooseRoom = (roomId: string) => {
    setSelectedId(roomId);
    window.requestAnimationFrame(() => {
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  if (!data?.rooms?.length) {
    return (
      <main className="app-shell">
        <div className="loading-screen">
          <p>Connecting to SenseMap…</p>
          <button onClick={loadRooms}>Open demo rooms</button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>SenseMap</h1>
        </div>
      </header>

      <div className="page-stack">
        <section className="list-card">
          <div className="list-heading">
            <div>
              <p className="eyebrow">Find your focus</p>
              <h2>{filteredRooms.length} spaces</h2>
            </div>
          </div>

          <div className="filters" aria-label="Filter study spaces">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? "active" : ""}
                onClick={() => changeFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="room-list">
            {visibleRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className={`room-card ${selected?.id === room.id ? "selected" : ""}`}
                onClick={() => chooseRoom(room.id)}
              >
                <span className={`score-ring score-${scoreTone(room.reading.suitability_score)}`}>
                  {room.reading.suitability_score}
                </span>
                <span className="room-copy">
                  <strong>{room.name}</strong>
                  <small>
                    {room.building} · Floor {room.floor}
                  </small>
                  <span className="room-tags">
                    <em className={`tone-${room.reading.sound_status}`}>
                      {statusText("sound", room.reading.sound_status)}
                    </em>
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

          {hiddenCount > 0 && (
            <button
              type="button"
              className="list-toggle"
              onClick={() => setListExpanded((open) => !open)}
            >
              {listExpanded ? "Show less" : `Show ${hiddenCount} more`}
            </button>
          )}
        </section>

        <section className="map-card" ref={mapSectionRef} id="campus-map">
          <div className="map-title">
            <h2>Campus map</h2>
            {selected && <p>{selected.shortName}</p>}
          </div>
          <CampusMap
            rooms={rooms}
            selectedId={selected?.id ?? ""}
            visibleRoomIds={visibleRoomIds}
            onSelect={chooseRoom}
          />
          {apiError && (
            <div className="connection-warning">Connection interrupted — showing last known conditions.</div>
          )}
        </section>

        {selected && (
          <section className="focus-card" id="room-details">
            <div className="focus-topline">
              <span className="freshness">Updated {ageLabel(selected.reading.timestamp)}</span>
            </div>
            <div className="focus-heading">
              <div>
                <p className="eyebrow">{selected.building} · Floor {selected.floor}</p>
                <h2>{selected.name}</h2>
                <p className="focus-meta">
                  Room {selected.roomNumber} · {selected.hours}
                  {selected.outlets ? " · Outlets" : ""}
                </p>
              </div>
              <div className={`focus-score score-${scoreTone(selected.reading.suitability_score)}`}>
                <strong>{selected.reading.suitability_score}</strong>
                <span>{scoreLabel(selected.reading.suitability_score)}</span>
              </div>
            </div>

            <div className="metric-grid">
              <article>
                <small>Sound</small>
                <strong>{Math.round(selected.reading.sound_level)} / 100</strong>
                <em className={`tone-${selected.reading.sound_status}`}>
                  {statusText("sound", selected.reading.sound_status)}
                </em>
              </article>
              <article>
                <small>Light</small>
                <strong>
                  {Math.round(selected.reading.lux)}
                  {selected.reading.light_unit === "relative" ? "%" : " lx"}
                </strong>
                <em className={`tone-${selected.reading.light_status}`}>
                  {statusText("light", selected.reading.light_status)}
                </em>
              </article>
              <article>
                <small>Temperature</small>
                <strong>{selected.reading.temperature_c.toFixed(1)}°C</strong>
                <em className={`tone-${selected.reading.temperature_status}`}>
                  {statusText("temperature", selected.reading.temperature_status)}
                </em>
              </article>
              <article>
                <small>Crowd</small>
                <strong>{selected.reading.people_estimate} / {selected.capacity}</strong>
                <em className={`tone-${selected.reading.crowd_status}`}>
                  {statusText("crowd", selected.reading.crowd_status)}
                </em>
              </article>
            </div>

            <div className="occupancy-row">
              <div>
                <small>Occupancy</small>
                <strong>{Math.round(selected.reading.crowd_ratio * 100)}% full</strong>
              </div>
              <div className="capacity-track">
                <i style={{ width: `${selected.reading.crowd_ratio * 100}%` }} />
              </div>
            </div>
            <p className="privacy-copy">
              {selected.reading.crowd_source === "ble"
                ? "Bluetooth addresses are hashed in memory and discarded after each scan."
                : "No MAC addresses are stored. Crowd data is aggregate, manual, or simulated."}
            </p>
          </section>
        )}
      </div>

      <footer className="app-footer">
        <span>SFU Burnaby</span>
        <span>
          {activeNodes} live {activeNodes === 1 ? "node" : "nodes"} · {rooms.length} spaces
        </span>
      </footer>
    </main>
  );
}
