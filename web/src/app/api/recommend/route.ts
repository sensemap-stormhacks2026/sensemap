import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getRoomsWithReadings } from "@/lib/store";

export const runtime = "nodejs";

const recommendationSchema = z.object({
  recommended_room: z.string(),
  reason: z.string(),
  caveat: z.string(),
});

export async function GET() {
  const snapshot = await getRoomsWithReadings();
  const ranked = [...snapshot.rooms].sort(
    (a, b) => b.reading.suitability_score - a.reading.suitability_score,
  );
  const best = ranked[0];
  const fallback = {
    recommended_room: best.name,
    reason: `${best.reading.suitability_score}/100 suitability: ${best.reading.sound_status} noise and ${best.reading.crowd_status} crowding.`,
    caveat:
      best.reading.source === "simulated"
        ? "This room currently uses demo data."
        : "Conditions can change quickly; check the live timestamp.",
  };

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ ...fallback, powered_by: "deterministic" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const interaction = await ai.interactions.create({
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      input: `Recommend one SFU study room from this trusted sensor snapshot. Be concise and never invent values:\n${JSON.stringify(
        snapshot.rooms.map((room) => ({
          room: room.name,
          score: room.reading.suitability_score,
          noise: room.reading.sound_status,
          crowd: room.reading.crowd_status,
          temperature_c: room.reading.temperature_c,
          light: room.reading.light_status,
          source: room.reading.source,
        })),
      )}`,
      system_instruction:
        "You are SenseMap's study-space guide. Return factual, compact JSON and disclose simulated data.",
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            recommended_room: { type: "string" },
            reason: { type: "string" },
            caveat: { type: "string" },
          },
          required: ["recommended_room", "reason", "caveat"],
          additionalProperties: false,
        },
      },
    });
    const parsed = recommendationSchema.parse(
      JSON.parse(interaction.output_text ?? ""),
    );
    return Response.json({ ...parsed, powered_by: "gemini" });
  } catch (error) {
    console.error("[sensemap] Gemini fallback", error);
    return Response.json({ ...fallback, powered_by: "deterministic" });
  }
}
