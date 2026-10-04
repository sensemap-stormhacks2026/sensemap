"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RoomWithReading } from "@/lib/types";

type CampusMapProps = {
  rooms: RoomWithReading[];
  selectedId: string;
  visibleRoomIds: Set<string>;
  onSelect: (roomId: string) => void;
};

const BUILDING_LAYER_IDS = [
  "building-hologram-base",
  "sensemap-buildings-3d",
  "building-roof-glow",
  "sensemap-building-outline",
  "building-label",
] as const;

function points(
  rooms: RoomWithReading[],
  selectedId: string,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rooms.map((room) => ({
      type: "Feature",
      properties: {
        id: room.id,
        name: room.shortName,
        score: room.reading.suitability_score,
        selected: room.id === selectedId,
        buildingCode: room.buildingCode,
        floor: room.floor,
        capacity: room.capacity,
        outlets: room.outlets,
      },
      geometry: {
        type: "Point",
        coordinates: [room.longitude, room.latitude],
      },
    })),
  };
}

const scoreColor = (
  scoreExpression: maplibregl.ExpressionSpecification,
): maplibregl.ExpressionSpecification =>
  [
    "case",
    [">=", scoreExpression, 75],
    "#68ffe1",
    [">=", scoreExpression, 55],
    "#b8f34b",
    "#ff75d8",
  ] as maplibregl.ExpressionSpecification;

function roomColorExpression(): maplibregl.ExpressionSpecification {
  return scoreColor(["get", "score"]);
}

function scoreColorExpression(
  rooms: RoomWithReading[],
): maplibregl.ExpressionSpecification {
  const groupedScores = new Map<string, number[]>();
  rooms.forEach((room) => {
    const scores = groupedScores.get(room.buildingCode) ?? [];
    scores.push(room.reading.suitability_score);
    groupedScores.set(room.buildingCode, scores);
  });
  const expression: unknown[] = ["match", ["get", "buildingCode"]];
  groupedScores.forEach((scores, buildingCode) => {
    const score = scores.reduce((sum, item) => sum + item, 0) / scores.length;
    expression.push(
      buildingCode,
      score >= 75
        ? "#68ffe1"
        : score >= 55
          ? "#b8f34b"
          : "#ff75d8",
    );
  });
  expression.push("#708078");
  return expression as maplibregl.ExpressionSpecification;
}

export default function CampusMap({
  rooms,
  selectedId,
  visibleRoomIds,
  onSelect,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const roomsRef = useRef(rooms);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const [mapFailed, setMapFailed] = useState(false);
  const [inspectedBuilding, setInspectedBuilding] = useState<string | null>(null);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: [-122.91865, 49.27885],
      zoom: 15.55,
      pitch: 62,
      bearing: -31,
      attributionControl: false,
    });
    mapRef.current = map;
    const resizeMap = () => map.resize();
    window.setTimeout(resizeMap, 250);
    window.setTimeout(resizeMap, 1000);
    window.addEventListener("resize", resizeMap);
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    let styleReadyInterval: number | undefined;
    const initializeSenseMapLayers = () => {
      if (map.getSource("sensemap-buildings")) {
        if (styleReadyInterval !== undefined) {
          window.clearInterval(styleReadyInterval);
          styleReadyInterval = undefined;
        }
        return;
      }
      if (!map.getStyle()?.layers?.length) return;
      map.addSource("sensemap-buildings", {
        type: "geojson",
        data: "/sfu-buildings.geojson",
        attribution: "Building footprints © Simon Fraser University Facilities Services",
      });
      map.addLayer({
        id: "building-hologram-base",
        type: "line",
        source: "sensemap-buildings",
        paint: {
          "line-color": scoreColorExpression(roomsRef.current),
          "line-width": 8,
          "line-blur": 8,
          "line-opacity": 0.4,
        },
      });
      map.addLayer({
        id: "sensemap-buildings-3d",
        type: "fill-extrusion",
        source: "sensemap-buildings",
        paint: {
          "fill-extrusion-color": scoreColorExpression(roomsRef.current),
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.42,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "building-roof-glow",
        type: "fill-extrusion",
        source: "sensemap-buildings",
        paint: {
          "fill-extrusion-color": "#d9fff8",
          "fill-extrusion-height": ["+", ["get", "height"], 0.8],
          "fill-extrusion-base": ["-", ["get", "height"], 0.35],
          "fill-extrusion-opacity": 0.5,
        },
      });
      map.addLayer({
        id: "sensemap-building-outline",
        type: "line",
        source: "sensemap-buildings",
        paint: {
          "line-color": "#b7fff4",
          "line-width": 2,
          "line-blur": 0.4,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "building-label",
        type: "symbol",
        source: "sensemap-buildings",
        layout: {
          "text-field": [
            "format",
            ["get", "buildingCode"],
            { "font-scale": 1.2 },
            "\n",
            {},
            ["get", "roomCount"],
            { "font-scale": 0.72 },
            " SPACES",
            { "font-scale": 0.72 },
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-letter-spacing": 0.12,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#dffff9",
          "text-halo-color": "#03110f",
          "text-halo-width": 2,
        },
      });

      map.addSource("sensemap-rooms", {
        type: "geojson",
        data: points(roomsRef.current, selectedIdRef.current),
      });
      map.addLayer({
        id: "room-glow-wide",
        type: "circle",
        source: "sensemap-rooms",
        paint: {
          "circle-radius": ["case", ["get", "selected"], 32, 24],
          "circle-color": roomColorExpression(),
          "circle-opacity": ["case", ["get", "selected"], 0.42, 0.24],
          "circle-blur": 1,
        },
      });
      map.addLayer({
        id: "room-halo",
        type: "circle",
        source: "sensemap-rooms",
        paint: {
          "circle-radius": ["case", ["get", "selected"], 13, 10],
          "circle-color": roomColorExpression(),
          "circle-opacity": 0.78,
          "circle-blur": 0.25,
          "circle-stroke-width": ["case", ["get", "selected"], 3, 1.5],
          "circle-stroke-color": "#e8fffb",
        },
      });
      map.addLayer({
        id: "room-core",
        type: "circle",
        source: "sensemap-rooms",
        paint: {
          "circle-radius": ["case", ["get", "selected"], 4.5, 3],
          "circle-color": "#f4fffd",
          "circle-opacity": 1,
        },
      });
      map.addLayer({
        id: "room-score",
        type: "symbol",
        source: "sensemap-rooms",
        layout: {
          "text-field": [
            "concat",
            ["get", "name"],
            "  ·  ",
            ["to-string", ["get", "score"]],
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": 10,
          "text-offset": [0, 1.8],
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-radial-offset": 0.7,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#eafffb",
          "text-halo-color": "#04100d",
          "text-halo-width": 1.5,
        },
      });

      const selectFeature = (
        event: maplibregl.MapLayerMouseEvent,
      ) => {
        const id = event.features?.[0]?.properties?.id;
        const room = roomsRef.current.find((item) => item.id === id);
        if (room) {
          setInspectedBuilding(room.buildingCode);
          onSelectRef.current(room.id);
          return;
        }
        const buildingCode = event.features?.[0]?.properties?.buildingCode;
        if (typeof buildingCode === "string") {
          setInspectedBuilding(buildingCode);
          const firstRoom = roomsRef.current.find(
            (item) => item.buildingCode === buildingCode,
          );
          if (firstRoom) onSelectRef.current(firstRoom.id);
        }
      };
      map.on("click", "room-glow-wide", selectFeature);
      map.on("click", "room-halo", selectFeature);
      map.on("click", "room-core", selectFeature);
      map.on("click", "room-score", selectFeature);
      map.on("click", "sensemap-buildings-3d", selectFeature);
      map.on("click", "building-label", selectFeature);
      for (const layer of [
        "room-glow-wide",
        "room-halo",
        "room-core",
        "room-score",
        "sensemap-buildings-3d",
        "building-label",
      ]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }
      if (styleReadyInterval !== undefined) {
        window.clearInterval(styleReadyInterval);
        styleReadyInterval = undefined;
      }
    };
    map.on("styledata", initializeSenseMapLayers);
    map.on("load", initializeSenseMapLayers);
    styleReadyInterval = window.setInterval(initializeSenseMapLayers, 250);
    map.on("error", (event) => {
      if (event.error?.message.includes("Failed to fetch")) setMapFailed(true);
    });

    return () => {
      if (styleReadyInterval !== undefined) {
        window.clearInterval(styleReadyInterval);
      }
      window.removeEventListener("resize", resizeMap);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const visible = rooms.filter((room) => visibleRoomIds.has(room.id));
    const source = map.getSource("sensemap-rooms") as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(points(visible, selectedId));
    if (map.getLayer("sensemap-buildings-3d")) {
      const color = scoreColorExpression(rooms);
      map.setPaintProperty(
        "sensemap-buildings-3d",
        "fill-extrusion-color",
        color,
      );
      map.setPaintProperty("building-hologram-base", "line-color", color);
      const visibleBuildings = [
        ...new Set(visible.map((room) => room.buildingCode)),
      ];
      BUILDING_LAYER_IDS.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setFilter(layerId, [
            "in",
            ["get", "buildingCode"],
            ["literal", visibleBuildings],
          ]);
        }
      });
    }
  }, [rooms, selectedId, visibleRoomIds]);

  useEffect(() => {
    const room = rooms.find((item) => item.id === selectedId);
    const map = mapRef.current;
    if (!room || !map) return;
    map.easeTo({
      center: [room.longitude, room.latitude],
      zoom: Math.max(map.getZoom(), 16),
      duration: 700,
    });
  }, [rooms, selectedId]);

  const inspectedRooms = inspectedBuilding
    ? rooms
        .filter((room) => room.buildingCode === inspectedBuilding)
        .sort((a, b) => a.floor - b.floor || a.roomNumber.localeCompare(b.roomNumber))
    : [];
  const inspectedName = inspectedRooms[0]?.building;
  const inspectedCapacity = inspectedRooms.reduce(
    (total, room) => total + room.capacity,
    0,
  );

  return (
    <div className="campus-map-shell">
      <div ref={containerRef} className="campus-map" aria-label="3D map of SFU Burnaby" />
      {mapFailed && (
        <div className="map-network-note">
          Basemap unavailable. Live room overlays will return when connected.
        </div>
      )}
      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-dot best" />Optimal</span>
        <span><i className="legend-dot good" />Available</span>
        <span><i className="legend-dot limited" />Busy</span>
        <small>SFU footprint · estimated height</small>
      </div>
      {inspectedBuilding && inspectedName && (
        <section className="building-inspector" aria-label={`${inspectedName} rooms`}>
          <div className="building-inspector-heading">
            <div>
              <span>{inspectedBuilding} · Building scan</span>
              <strong>{inspectedName}</strong>
              <small>
                {inspectedRooms.length} {inspectedRooms.length === 1 ? "space" : "spaces"} ·{" "}
                {inspectedCapacity} total seats
              </small>
            </div>
            <button
              type="button"
              aria-label="Close building information"
              onClick={() => setInspectedBuilding(null)}
            >
              ×
            </button>
          </div>
          <div className="building-room-grid">
            {inspectedRooms.map((room) => (
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
