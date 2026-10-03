import { getRoomsWithReadings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const response = await getRoomsWithReadings();
  return Response.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
