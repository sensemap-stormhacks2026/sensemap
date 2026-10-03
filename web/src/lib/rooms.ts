import type { Room } from "./types";

export const ROOMS: Room[] = [
  {
    id: "aq-3000",
    name: "AQ 3000 Study Commons",
    shortName: "AQ",
    building: "Academic Quadrangle",
    floor: 3,
    latitude: 49.2782,
    longitude: -122.91972,
    areaM2: 220,
    capacity: 80,
  },
  {
    id: "wac-bennett",
    name: "W.A.C. Bennett Library",
    shortName: "WAC",
    building: "W.A.C. Bennett Library",
    floor: 3,
    latitude: 49.2792,
    longitude: -122.91824,
    areaM2: 420,
    capacity: 140,
  },
  {
    id: "asb-atrium",
    name: "ASB Atrium",
    shortName: "ASB",
    building: "Applied Sciences Building",
    floor: 1,
    latitude: 49.27807,
    longitude: -122.9149,
    areaM2: 310,
    capacity: 110,
  },
  {
    id: "sub-lounge",
    name: "Student Union Lounge",
    shortName: "SUB",
    building: "Student Union Building",
    floor: 2,
    latitude: 49.27954,
    longitude: -122.92252,
    areaM2: 360,
    capacity: 125,
  },
];

export function getRoom(roomId: string): Room | undefined {
  return ROOMS.find((room) => room.id === roomId);
}
