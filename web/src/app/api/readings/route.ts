import { z } from "zod";
import { saveReading } from "@/lib/store";

export const runtime = "nodejs";

const readingSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  device_id: z.string().min(1).max(80),
  room_id: z.string().min(1).max(80),
  lux: z.number().min(0).max(200_000),
  sound_level: z.number().min(0).max(100),
  temperature_c: z.number().min(-20).max(70),
  people_estimate: z.number().int().min(0).max(20_000),
  source: z.enum(["live", "estimated", "simulated"]),
  quality: z.number().min(0).max(1),
});

export async function POST(request: Request) {
  const expectedToken = process.env.DEVICE_TOKEN ?? "sensemap-demo-token";
  if (request.headers.get("x-device-token") !== expectedToken) {
    return Response.json({ error: "Invalid device token" }, { status: 401 });
  }

  try {
    const reading = readingSchema.parse(await request.json());
    const storage = await saveReading(reading);
    return Response.json({ ok: true, storage, received_at: new Date().toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid reading", issues: error.issues },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unable to save reading";
    return Response.json({ error: message }, { status: 400 });
  }
}

export function GET() {
  return Response.json({
    ok: true,
    endpoint: "SenseMap sensor ingestion",
    interval_seconds: "2–5",
  });
}
