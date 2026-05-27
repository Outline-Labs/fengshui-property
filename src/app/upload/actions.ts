"use server";

import { analyzeFloorPlanImage } from "@/lib/kimi";
import type { FloorPlanAnalysis } from "@/lib/types";

export type FloorPlanResult =
  | { ok: true; analysis: FloorPlanAnalysis }
  | { ok: false; error: string };

export async function analyzeFloorPlan(
  imageDataUrl: string,
  facing: string,
  yearBuilt?: number,
): Promise<FloorPlanResult> {
  if (!imageDataUrl.startsWith("data:image/")) {
    return { ok: false, error: "Please upload a valid image (PNG or JPG)." };
  }
  if (!facing.trim()) {
    return { ok: false, error: "Please set which direction the unit faces." };
  }

  try {
    const analysis = await analyzeFloorPlanImage({
      imageDataUrl,
      facing,
      yearBuilt: yearBuilt && yearBuilt > 1900 ? yearBuilt : undefined,
    });
    return { ok: true, analysis };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "The analysis failed. Please try again.",
    };
  }
}
