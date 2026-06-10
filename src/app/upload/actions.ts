"use server";

import { headers } from "next/headers";

import { applyReferralActivation } from "@/lib/credits";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  type OtpResult,
  finalizeReading,
  floorPlanReadingsSince,
  getCredits,
  getLead,
  normalizeSgMobile,
  releaseReading,
  requestOtp,
  reserveReading,
  verifyOtp,
  verifyOtpAndRequestAgent,
} from "@/lib/leads";
import { dir8FromString } from "@/lib/fengshui/flying-stars";
import { computeUnitReading } from "@/lib/fengshui/unit-reading";
import { analyzeFloorPlanImage } from "@/lib/kimi";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  getCachedReading,
  putCachedReading,
  readingKey,
} from "@/lib/reading-cache";
import { getLeadId } from "@/lib/session";
import type {
  FloorPlanAnalysis,
  FloorPlanFactor,
  FloorPlanRoom,
  UnitEngineSummary,
} from "@/lib/types";

// Every OTP is a paid SMS and the phone is fully caller-controlled, so throttle
// hard — per lead, per IP, per destination number, and a global daily ceiling —
// to stop SMS pumping / toll fraud. Fails closed via rateLimit's counters.
async function throttledRequestOtp(phone: string): Promise<OtpResult> {
  const leadId = await getLeadId();
  if (!leadId) return { ok: false, error: "Please sign up first." };
  const h = await headers();
  const ip = clientIp(h);
  const num = normalizeSgMobile(phone) ?? "invalid";
  const checks = await Promise.all([
    rateLimit({ key: `otp-lead:${leadId}`, limit: 5, windowMs: 3_600_000, failClosed: true }),
    rateLimit({ key: `otp-ip:${ip}`, limit: 8, windowMs: 3_600_000, failClosed: true }),
    rateLimit({ key: `otp-num:${num}`, limit: 5, windowMs: 86_400_000, failClosed: true }),
    rateLimit({
      key: "otp-global",
      limit: Number(process.env.MAX_DAILY_OTP) || 500,
      windowMs: 86_400_000,
      failClosed: true,
    }),
  ]);
  if (checks.some((c) => !c.ok)) {
    return {
      ok: false,
      error: "Too many code requests just now — please wait a bit and try again.",
    };
  }
  return requestOtp(leadId, phone);
}

export async function requestSpecialistOtp(phone: string): Promise<OtpResult> {
  return throttledRequestOtp(phone);
}

export async function confirmSpecialist(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const leadId = await getLeadId();
  if (!leadId) return { ok: false, error: "Please sign up first." };
  return verifyOtpAndRequestAgent(leadId, code);
}

// Consumer phone verification (no agent involved) — verifying unlocks the +1
// profile quota bonus. Mirrors the specialist OTP but never sets wantsAgent.
export async function requestPhoneOtp(phone: string): Promise<OtpResult> {
  return throttledRequestOtp(phone);
}

export async function confirmPhoneOtp(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const leadId = await getLeadId();
  if (!leadId) return { ok: false, error: "Please sign up first." };
  return verifyOtp(leadId, code);
}

export type FloorPlanResult =
  | { ok: true; analysis: FloorPlanAnalysis; remaining: number }
  | {
      ok: false;
      error: string;
      code?: "no_session" | "out_of_credits" | "verify_email";
    };

// Server-side guard: the client resizes to a small JPEG, but a direct call could
// bypass that, so allowlist real raster MIME types (no SVG) and cap the decoded
// size — both bound the per-call Kimi cost and the abuse surface.
const ALLOWED_IMAGE = /^data:image\/(png|jpe?g|webp);base64,/i;
const MAX_IMAGE_BYTES = 2_500_000; // ~2.5 MB decoded; well above a resized plan

function imageError(dataUrl: string): string | null {
  if (!ALLOWED_IMAGE.test(dataUrl)) {
    return "Please upload a PNG, JPG, or WEBP image (or a PDF).";
  }
  const comma = dataUrl.indexOf(",");
  const approxBytes = Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return "That image is too large — please use a smaller or lower-resolution floor plan.";
  }
  return null;
}

export async function analyzeFloorPlan(
  imageDataUrl: string,
  facing: string,
  yearBuilt?: number,
): Promise<FloorPlanResult> {
  const imgErr = imageError(imageDataUrl);
  if (imgErr) return { ok: false, error: imgErr };
  if (!facing.trim()) {
    return { ok: false, error: "Please set which direction the unit faces." };
  }

  const leadId = await getLeadId();
  if (!leadId) {
    return { ok: false, error: "Please sign up to read your unit.", code: "no_session" };
  }

  // No reading — cached or paid — before the email is verified. Checked here so
  // the free cache-hit path below is gated too, not just reserveReading.
  const lead = await getLead(leadId);
  if (!lead) {
    return { ok: false, error: "Please sign up to read your unit.", code: "no_session" };
  }
  if (lead.emailVerified !== 1) {
    return {
      ok: false,
      error: "Please verify your email first — we sent you a link.",
      code: "verify_email",
    };
  }

  const year = yearBuilt && yearBuilt > 1900 ? yearBuilt : undefined;

  // Same plan → same reading: a content-addressed cache returns the identical
  // result for an identical upload (the vision model isn't deterministic), and
  // doesn't re-bill a credit for re-reading the same plan.
  const key = readingKey(imageDataUrl, facing, year);
  const cached = await getCachedReading(key);
  if (cached) {
    const { remaining } = await getCredits(leadId);
    return { ok: true, analysis: cached, remaining };
  }

  // Per-IP throttle on the PAID path (cache hits above are free, so they don't
  // count). Plan-independent app-level limit that complements the Vercel Firewall
  // rule and, unlike it, counts only the real reading call — not page GETs / RSC
  // prefetches.
  const rl = await rateLimit({
    key: `reading:${clientIp(await headers())}`,
    limit: 12,
    windowMs: 600_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error:
        "Too many readings from your network just now — please wait a few minutes.",
    };
  }

  // Global spend ceiling: cap vision-billed reads over a rolling 24h so a burst
  // that slips past the per-IP firewall limit can't run the Kimi bill to
  // infinity. A high default that normal launch traffic won't reach; tune via env.
  const dailyCap = Number(process.env.MAX_DAILY_READINGS) || 2000;
  if ((await floorPlanReadingsSince(Date.now() - 86_400_000)) >= dailyCap) {
    return {
      ok: false,
      error: "Readings are paused briefly due to high demand — please try again soon.",
    };
  }

  // Atomically claim a credit BEFORE the paid Kimi call so concurrent uploads
  // can't overspend the quota; refund it if the analysis fails.
  const reservation = await reserveReading(leadId, "floor_plan");
  if (!reservation.ok) {
    if (reservation.reason === "no_session") {
      return { ok: false, error: "Please sign up to read your unit.", code: "no_session" };
    }
    if (reservation.reason === "verify_email") {
      return {
        ok: false,
        error: "Please verify your email first — we sent you a link.",
        code: "verify_email",
      };
    }
    return {
      ok: false,
      error: "You've used all your free readings.",
      code: "out_of_credits",
    };
  }

  try {
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
    await putCachedReading(key, analysis); // so a re-upload of this plan matches
    // A completed reading is "activation": release the referrer's reward (if any).
    // Idempotent and best-effort — never fail the reading over a referral bump.
    try {
      await applyReferralActivation(leadId);
    } catch (e) {
      console.error("[referral] activation failed", e);
    }
    const ph = getPostHogClient();
    if (ph) {
      ph.capture({
        distinctId: leadId,
        event: "floor_plan_analyzed",
        properties: {
          facing,
          year_built: year,
          score: analysis.score,
          confidence: analysis.confidence,
          factor_count: analysis.factors.length,
          remaining_credits: reservation.remaining,
          engine_period: analysis.engine?.period,
          engine_group: analysis.engine?.group,
        },
      });
      await ph.flush(); // deliver before the action returns (serverless)
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

export type RecomputeResult =
  | { ok: true; score: number; factors: FloorPlanFactor[]; engine: UnitEngineSummary }
  | { ok: false; error: string };

/**
 * Recompute the reading from a user-confirmed layout — pure engine, no vision
 * model and no credit. This is the reproducibility fix: once the user has
 * corrected which room sits in which sector, the score is fully deterministic.
 * Returns only the engine half (score + 八宅/飞星 factors + summary); the caller
 * keeps the form-school (峦头) factors from the original reading.
 */
export async function recomputeReading(
  facing: string,
  yearBuilt: number | undefined,
  rooms: FloorPlanRoom[],
): Promise<RecomputeResult> {
  const leadId = await getLeadId();
  if (!leadId) return { ok: false, error: "Please sign up first." };

  const dir = dir8FromString(facing);
  if (!dir) return { ok: false, error: "Set which way the unit faces first." };

  const year = yearBuilt && yearBuilt > 1900 ? yearBuilt : undefined;
  const det = computeUnitReading(
    dir,
    year,
    rooms.map((r) => ({ name: r.name, sector: r.sector })),
  );
  return {
    ok: true,
    score: det.score,
    factors: det.factors,
    engine: {
      period: det.period,
      group: det.group,
      houseGua: det.houseGua,
      auspicious: det.auspicious,
      inauspicious: det.inauspicious,
    },
  };
}
