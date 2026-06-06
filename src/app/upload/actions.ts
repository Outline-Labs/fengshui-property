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
    const analysis = await analyzeFloorPlanImage({
      imageDataUrl,
      facing,
      yearBuilt: yearBuilt && yearBuilt > 1900 ? yearBuilt : undefined,
    });
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
