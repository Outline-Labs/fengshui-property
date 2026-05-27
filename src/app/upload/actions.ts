"use server";

import { getCredits, recordAnalysis } from "@/lib/leads";
import { analyzeFloorPlanImage } from "@/lib/kimi";
import { getLeadId } from "@/lib/session";
import type { FloorPlanAnalysis } from "@/lib/types";

export type FloorPlanResult =
  | { ok: true; analysis: FloorPlanAnalysis; remaining: number }
  | { ok: false; error: string; code?: "no_session" | "out_of_credits" };

export async function analyzeFloorPlan(
  imageDataUrl: string,
  facing: string,
  yearBuilt?: number,
): Promise<FloorPlanResult> {
  if (!imageDataUrl.startsWith("data:image/")) {
    return { ok: false, error: "Please upload a valid image or PDF." };
  }
  if (!facing.trim()) {
    return { ok: false, error: "Please set which direction the unit faces." };
  }

  const leadId = await getLeadId();
  if (!leadId) {
    return { ok: false, error: "Please sign up to read your unit.", code: "no_session" };
  }

  const credits = await getCredits(leadId);
  if (!credits.lead) {
    return { ok: false, error: "Please sign up to read your unit.", code: "no_session" };
  }
  if (credits.remaining <= 0) {
    return {
      ok: false,
      error: "You've used all your free readings.",
      code: "out_of_credits",
    };
  }

  try {
    const analysis = await analyzeFloorPlanImage({
      imageDataUrl,
      facing,
      yearBuilt: yearBuilt && yearBuilt > 1900 ? yearBuilt : undefined,
    });
    await recordAnalysis(leadId, "floor_plan", facing, analysis.score);
    return { ok: true, analysis, remaining: credits.remaining - 1 };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "The analysis failed. Please try again.",
    };
  }
}
