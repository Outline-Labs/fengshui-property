"use server";

import { applyReferralActivation } from "@/lib/credits";
import {
  type OtpResult,
  finalizeReading,
  releaseReading,
  requestOtp,
  reserveReading,
  verifyOtpAndRequestAgent,
} from "@/lib/leads";
import { dir8FromString } from "@/lib/fengshui/flying-stars";
import { computeUnitReading } from "@/lib/fengshui/unit-reading";
import { analyzeFloorPlanImage } from "@/lib/kimi";
import { getLeadId } from "@/lib/session";
import type { FloorPlanAnalysis } from "@/lib/types";

export async function requestSpecialistOtp(phone: string): Promise<OtpResult> {
  const leadId = await getLeadId();
  if (!leadId) return { ok: false, error: "Please sign up first." };
  return requestOtp(leadId, phone);
}

export async function confirmSpecialist(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const leadId = await getLeadId();
  if (!leadId) return { ok: false, error: "Please sign up first." };
  return verifyOtpAndRequestAgent(leadId, code);
}

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

  // Atomically claim a credit BEFORE the paid Kimi call so concurrent uploads
  // can't overspend the quota; refund it if the analysis fails.
  const reservation = await reserveReading(leadId, "floor_plan");
  if (!reservation.ok) {
    return reservation.reason === "no_session"
      ? { ok: false, error: "Please sign up to read your unit.", code: "no_session" }
      : {
          ok: false,
          error: "You've used all your free readings.",
          code: "out_of_credits",
        };
  }

  try {
    const year = yearBuilt && yearBuilt > 1900 ? yearBuilt : undefined;
    // The LLM is perception only: rooms + their sectors + form-school (峦头) notes.
    const llm = await analyzeFloorPlanImage({ imageDataUrl, facing, yearBuilt: year });

    // The deterministic engine owns the verdict: Flying Stars + Eight Mansions →
    // a reproducible score and 八宅/玄空飞星 factors. We keep the LLM's form-school
    // observations and its rooms/summary/recommendations.
    const dir = dir8FromString(facing);
    const analysis: FloorPlanAnalysis = dir
      ? (() => {
          const det = computeUnitReading(dir, year, llm.rooms);
          const formSchool = llm.factors.filter((f) => f.principle === "峦头");
          return {
            ...llm,
            score: det.score,
            factors: [...det.factors, ...formSchool],
            engine: {
              period: det.period,
              group: det.group,
              houseGua: det.houseGua,
              auspicious: det.auspicious,
              inauspicious: det.inauspicious,
            },
          };
        })()
      : llm; // facing not one of the 8 directions — fall back to the LLM reading

    await finalizeReading(reservation.id, facing, analysis.score);
    // A completed reading is "activation": release the referrer's reward (if any).
    // Idempotent and best-effort — never fail the reading over a referral bump.
    try {
      await applyReferralActivation(leadId);
    } catch (e) {
      console.error("[referral] activation failed", e);
    }
    return { ok: true, analysis, remaining: reservation.remaining };
  } catch (e) {
    await releaseReading(reservation.id); // refund the credit on failure
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "The analysis failed. Please try again.",
    };
  }
}
