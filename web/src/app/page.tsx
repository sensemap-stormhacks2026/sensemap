import SenseMapDashboard from "@/components/SenseMapDashboard";
import { createDemoSnapshot } from "@/lib/demo-snapshot";
import { getRoomsWithReadings } from "@/lib/store";
import type { RoomsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

function withTimeout(
  promise: Promise<RoomsResponse>,
  milliseconds: number,
): Promise<RoomsResponse> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(createDemoSnapshot()), milliseconds);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      clearTimeout(timer);
      resolve(createDemoSnapshot());
    });
  });
}

export default async function Home() {
  const initialData = await withTimeout(getRoomsWithReadings(), 2500);
  return <SenseMapDashboard initialData={initialData} />;
}
