"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CampusMap from "./CampusMap";
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

const OTHER_PREVIEW_COUNT = 2;

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

function ScoreMeter({ score }: { score: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className={`score-meter score-${scoreTone(score)}`} aria-label={`Suitability ${score}`}>
      <svg viewBox="0 0 64 64">
        <circle className="track" cx="32" cy="32" r={radius} />
        <circle
          className="value"
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <strong>{score}</strong>
    </div>
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
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [guideRoomId, setGuideRoomId] = useState<string | null>(null);
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
  const filteredRooms = useMemo(
    () =>
      [...rooms]
        .filter((room) => visibleRoomIds.has(room.id))
        .sort((a, b) => b.reading.suitability_score - a.reading.suitability_score),
    [rooms, visibleRoomIds],
  );
  useEffect(() => {
    const match = recommendation
      ? rooms.find(
          (room) =>
            room.name === recommendation.recommended_room ||
            room.shortName === recommendation.recommended_room,
        )
      : null;
    if (match) {
      setGuideRoomId(match.id);
      return;
    }
    if (!guideRoomId && filteredRooms[0]) {
      setGuideRoomId(filteredRooms[0].id);
    }
  }, [filteredRooms, guideRoomId, recommendation, rooms]);

  const recommendedRoom =
    rooms.find((room) => room.id === guideRoomId) ??
    filteredRooms[0] ??
    rooms[0];
  const otherRooms = filteredRooms.filter((room) => room.id !== selected?.id);
  const visibleOtherRooms = listExpanded
    ? otherRooms
    : otherRooms.slice(0, OTHER_PREVIEW_COUNT);
  const hiddenCount = Math.max(0, otherRooms.length - OTHER_PREVIEW_COUNT);
  const activeNodes = rooms.filter(
    (room) => room.reading.source !== "simulated" && !room.reading.stale,
  ).length;

  const changeFilter = (value: Filter) => {
    setFilter(value);
    setListExpanded(false);
  };

  const chooseRoom = (roomId: string) => {
    setSelectedId(roomId);
    if (!window.matchMedia("(max-width: 979px)").matches) return;
    window.requestAnimationFrame(() => {
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

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
          <span className="live-pill">
            <i />
            Live
          </span>
          <span className="network-status">
            {activeNodes} {activeNodes === 1 ? "node" : "nodes"} · {rooms.length} spaces
          </span>
        </div>
      </header>

      <div className="page-stack">
        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">Find your focus</p>
            <h2>
              {filteredRooms.length} matching {filteredRooms.length === 1 ? "space" : "spaces"} right now
            </h2>
            <p>
              {recommendation?.reason ??
                `${recommendedRoom.name} is the current best fit from live and demo conditions.`}
            </p>
            <small>
              {recommendation?.caveat ?? "Scores weigh sound, crowd, temperature, and light."}
            </small>
          </div>
          <button
            type="button"
            className="hero-select"
            onClick={() => chooseRoom(recommendedRoom.id)}
          >
            Select {recommendedRoom.shortName}
          </button>
        </section>

        <section className="filter-card" aria-label="Filter study spaces">
          <p className="section-kicker">Choose a condition</p>
          <div className="filters">
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
        </section>

        <section className="map-card" ref={mapSectionRef} id="campus-map">
          <div className="map-title">
            <div>
              <span className="live-pulse"><i />Campus map</span>
              <h2>Burnaby live conditions</h2>
            </div>
            {selected && <p>Showing {selected.shortName}</p>}
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
              <SourceBadge room={selected} />
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
              <div className="focus-score">
                <ScoreMeter score={selected.reading.suitability_score} />
                <span>
                  <b>{scoreLabel(selected.reading.suitability_score)}</b>
                  Study match
                </span>
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
                <small>Occupancy estimate</small>
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

        <section className="other-card">
          <div className="other-heading">
            <div>
              <p className="section-kicker">Other spaces</p>
              <h3>{otherRooms.length} more {otherRooms.length === 1 ? "match" : "matches"}</h3>
            </div>
            {hiddenCount > 0 && (
              <button type="button" className="list-toggle" onClick={() => setListExpanded((open) => !open)}>
                {listExpanded ? "Show fewer" : `View all ${otherRooms.length}`}
              </button>
            )}
          </div>

          <div className="room-list">
            {visibleOtherRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className="room-card"
                onClick={() => chooseRoom(room.id)}
              >
                <span className={`score-ring score-${scoreTone(room.reading.suitability_score)}`}>
                  {room.reading.suitability_score}
                </span>
                <span className="room-copy">
                  <strong>{room.name}</strong>
                  <small>
                    {room.shortName} · {statusText("sound", room.reading.sound_status)} ·{" "}
                    {Math.round(room.reading.crowd_ratio * 100)}% full
                  </small>
                </span>
                <span className="select-chip">Select</span>
              </button>
            ))}
            {visibleRoomIds.size === 0 && (
              <div className="empty-filter">No spaces match this filter right now.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
