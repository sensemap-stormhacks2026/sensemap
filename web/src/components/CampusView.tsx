"use client";

import { useEffect, useState, type ComponentType } from "react";
import CampusSketch from "./CampusSketch";
import type { RoomWithReading } from "@/lib/types";

type CampusViewProps = {
  rooms: RoomWithReading[];
  selectedId: string;
  visibleRoomIds: Set<string>;
  onSelect: (roomId: string) => void;
};

type MapComponent = ComponentType<CampusViewProps>;

export default function CampusView(props: CampusViewProps) {
  const [MapImpl, setMapImpl] = useState<MapComponent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = window.setTimeout(() => {
      void import("./CampusMap")
        .then((module) => {
          if (!cancelled) setMapImpl(() => module.default);
        })
        .catch(() => {
          // Keep the always-visible campus sketch on phones that cannot load WebGL.
        });
    }, 50);
    return () => {
      cancelled = true;
      window.clearTimeout(load);
    };
  }, []);

  if (MapImpl) return <MapImpl {...props} />;
  return <CampusSketch {...props} />;
}
