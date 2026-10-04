"use client";

import { useMemo, useState } from "react";
import type { RoomWithReading } from "@/lib/types";

type CampusSketchProps = {
  rooms: RoomWithReading[];
  selectedId: string;
  visibleRoomIds: Set<string>;
  onSelect: (roomId: string) => void;
};

const BUILDING_LAYOUT: Record<
  string,
  { left: string; top: string; width: string; height: string }
> = {
  WMC: { left: "4%", top: "10%", width: "24%", height: "28%" },
  SUB: { left: "24%", top: "36%", width: "22%", height: "34%" },
  MBC: { left: "38%", top: "14%", width: "18%", height: "24%" },
  AQ: { left: "50%", top: "32%", width: "26%", height: "36%" },
  ASB: { left: "72%", top: "52%", width: "24%", height: "32%" },
};

function scoreTone(score: number) {
  if (score >= 75) return "best";
  if (score >= 55) return "good";
  return "limited";
}

export default function CampusSketch({
  rooms,
  selectedId,
  visibleRoomIds,
  onSelect,
}: CampusSketchProps) {
  const [openBuilding, setOpenBuilding] = useState<string | null>(
    rooms.find((room) => room.id === selectedId)?.buildingCode ?? null,
  );

  const buildings = useMemo(() => {
    const grouped = new Map<string, RoomWithReading[]>();
    rooms.forEach((room) => {
      if (!visibleRoomIds.has(room.id)) return;
      const list = grouped.get(room.buildingCode) ?? [];
      list.push(room);
      grouped.set(room.buildingCode, list);
    });
    return [...grouped.entries()].map(([code, spots]) => {
      const score =
        spots.reduce((sum, room) => sum + room.reading.suitability_score, 0) /
        spots.length;
      return {
        code,
        name: spots[0]?.building ?? code,
        score: Math.round(score),
        spots: spots.sort((a, b) => a.floor - b.floor),
      };
    });
  }, [rooms, visibleRoomIds]);

  return (
    <div className="campus-map-shell campus-sketch-shell">
      <div className="campus-sketch" aria-label="SFU Burnaby study-space sketch">
        {buildings.map((building) => {
          const layout = BUILDING_LAYOUT[building.code] ?? {
            left: "40%",
            top: "40%",
            width: "20%",
            height: "20%",
          };
          return (
            <button
              type="button"
              key={building.code}
              className={`sketch-building tone-${scoreTone(building.score)} ${
                openBuilding === building.code ? "active" : ""
              }`}
              style={layout}
              onClick={() => {
                setOpenBuilding(building.code);
                onSelect(building.spots[0]?.id ?? "");
              }}
            >
              <span className="sketch-building-code">{building.code}</span>
              <strong>{building.score}</strong>
              <small>{building.spots.length} spaces</small>
              <span className="sketch-dots">
                {building.spots.map((room) => (
                  <i
                    key={room.id}
                    className={room.id === selectedId ? "selected" : ""}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {openBuilding && (
        <section className="building-inspector" aria-label="Building rooms">
          <div className="building-inspector-heading">
            <div>
              <span>{openBuilding} · Building scan</span>
              <strong>
                {buildings.find((item) => item.code === openBuilding)?.name}
              </strong>
              <small>Tap a room for live conditions</small>
            </div>
            <button type="button" onClick={() => setOpenBuilding(null)}>
              ×
            </button>
          </div>
          <div className="building-room-grid">
            {buildings
              .find((item) => item.code === openBuilding)
              ?.spots.map((room) => (
                <button
                  type="button"
                  key={room.id}
                  className={room.id === selectedId ? "active" : ""}
                  onClick={() => onSelect(room.id)}
                >
                  <span>
                    <strong>{room.name}</strong>
                    <small>
                      Floor {room.floor} · {room.capacity} seats
                      {room.outlets ? " · Outlets" : ""}
                    </small>
                  </span>
                  <b>{room.reading.suitability_score}</b>
                </button>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
