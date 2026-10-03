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

function points(rooms: RoomWithReading[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rooms.map((room) => ({
      type: "Feature",
      properties: {
        id: room.id,
        name: room.shortName,
        score: room.reading.suitability_score,
      },
      geometry: {
        type: "Point",
        coordinates: [room.longitude, room.latitude],
      },
    })),
  };
}

function scoreColorExpression(
  rooms: RoomWithReading[],
): maplibregl.ExpressionSpecification {
  const expression: unknown[] = ["match", ["get", "id"]];
  rooms.forEach((room) => {
    expression.push(
      room.id,
      room.reading.suitability_score >= 75
        ? "#b8f34b"
        : room.reading.suitability_score >= 55
          ? "#f4c65b"
          : "#ff7369",
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
  const onSelectRef = useRef(onSelect);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    maplibregl.setWorkerUrl(
      "https://unpkg.com/maplibre-gl@6.12.0/dist/maplibre-gl-worker.mjs",
    );
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/bright",
      center: [-122.9192, 49.2787],
      zoom: 15.7,
      pitch: 55,
      bearing: -28,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    map.on("load", () => {
      map.addSource("sensemap-buildings", {
        type: "geojson",
        data: "/sfu-buildings.geojson",
      });
      map.addLayer({
        id: "sensemap-buildings-3d",
        type: "fill-extrusion",
        source: "sensemap-buildings",
        paint: {
          "fill-extrusion-color": scoreColorExpression(roomsRef.current),
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.82,
        },
      });
      map.addLayer({
        id: "sensemap-building-outline",
        type: "line",
        source: "sensemap-buildings",
        paint: {
          "line-color": "#f7fff0",
          "line-width": 1.5,
          "line-opacity": 0.65,
        },
      });

      map.addSource("sensemap-rooms", {
        type: "geojson",
        data: points(roomsRef.current),
      });
      map.addLayer({
        id: "room-halo",
        type: "circle",
        source: "sensemap-rooms",
        paint: {
          "circle-radius": 19,
          "circle-color": "#07110d",
          "circle-opacity": 0.82,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#dfffc1",
        },
      });
      map.addLayer({
        id: "room-score",
        type: "symbol",
        source: "sensemap-rooms",
        layout: {
          "text-field": ["concat", ["get", "name"], "\n", ["to-string", ["get", "score"]]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-anchor": "center",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#f4f8f5",
          "text-halo-color": "#07110d",
          "text-halo-width": 0.5,
        },
      });

      const selectFeature = (
        event: maplibregl.MapLayerMouseEvent,
      ) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current(id);
      };
      map.on("click", "room-halo", selectFeature);
      map.on("click", "room-score", selectFeature);
      map.on("click", "sensemap-buildings-3d", selectFeature);
      for (const layer of ["room-halo", "room-score", "sensemap-buildings-3d"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });
    map.on("error", (event) => {
      if (event.error?.message.includes("Failed to fetch")) setMapFailed(true);
    });

    return () => {
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
    source?.setData(points(visible));
    if (map.getLayer("sensemap-buildings-3d")) {
      map.setPaintProperty(
        "sensemap-buildings-3d",
        "fill-extrusion-color",
        scoreColorExpression(rooms),
      );
      map.setFilter("sensemap-buildings-3d", [
        "in",
        ["get", "id"],
        ["literal", [...visibleRoomIds]],
      ]);
    }
  }, [rooms, visibleRoomIds]);

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

  return (
    <div className="campus-map-shell">
      <div ref={containerRef} className="campus-map" aria-label="3D map of SFU Burnaby" />
      {mapFailed && (
        <div className="map-network-note">
          Basemap unavailable. Live room overlays will return when connected.
        </div>
      )}
      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-dot best" />Best fit</span>
        <span><i className="legend-dot good" />Good fit</span>
        <span><i className="legend-dot limited" />Limited</span>
      </div>
    </div>
  );
}
