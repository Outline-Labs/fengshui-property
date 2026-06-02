// LAYER A — compass bearing → 24-mountain → (sitting / facing) hexagram.
//
// WHAT'S SETTLED (deterministic, standard across luopans): the 24-mountain ring
// (15° each, 子 centred on true north), and that sitting (坐山) and facing (向)
// are always the opposite mountain (180° apart). This module computes those.
//
// WHAT'S GATED (per research): the 64-hexagram ring (~5.625° each) and the exact
// hexagram that owns a given bearing are NOT derivable from first principles —
// lineages rotate the ring and the absolute 0°-north offset is brand-specific,
// so it MUST be transcribed from the practitioner's actual luopan, not computed.
// We therefore ship only the TWO verified anchors from the worked example and
// return null ("pending transcription") for every other mountain. Do not invent
// the rest.
//
// WHAT'S BLOCKED: the per-hexagram index pair (e.g. 小畜 = 29/84) — no published
// table decodes it; it likely encodes 卦運. Carried verbatim, never interpreted.

import { type DaguaChart, type Stem, buildChart } from "./dagua";

// The 24 mountains in compass order, each centred on a 15° increment from true
// north (子 = 0°). Band for a mountain = centre ± 7.5°.
export const MOUNTAINS = [
  "子", "癸", "丑", "艮", "寅", "甲", "卯", "乙", "辰", "巽", "巳", "丙",
  "午", "丁", "未", "坤", "申", "庚", "酉", "辛", "戌", "乾", "亥", "壬",
] as const;
export type Mountain = (typeof MOUNTAINS)[number];

export function mountainCenterDeg(m: Mountain): number {
  return MOUNTAINS.indexOf(m) * 15;
}

/** The mountain whose 15° band contains the bearing (0–360, wraps). */
export function mountainForBearing(deg: number): Mountain {
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.round(norm / 15) % 24; // bands are centre ± 7.5°
  return MOUNTAINS[idx];
}

/** The diametrically-opposite mountain (sitting ↔ facing). */
export function oppositeMountain(m: Mountain): Mountain {
  return MOUNTAINS[(MOUNTAINS.indexOf(m) + 12) % 24];
}

// VERIFIED ANCHORS ONLY (from the 41 Queen's Close worked example). The full
// 24→hexagram (really bearing→hexagram at 5.625°) table must be transcribed
// from the luopan before this can resolve the other mountains.
const MOUNTAIN_HEXAGRAM: Partial<Record<Mountain, string>> = {
  巳: "风天小畜", // 巳山 → 小畜 (index pair 29/84 on the source luopan)
  亥: "雷地豫", //   亥 (opposite) → 豫 (index pair 81/83)
};

export type SittingFacing = {
  bearingDeg: number;
  sittingMountain: Mountain;
  facingMountain: Mountain;
  sittingHexagram: string | null;
  facingHexagram: string | null;
  /** True when the hexagram(s) couldn't be resolved — the luopan ring table for
   *  these mountains hasn't been transcribed yet (only 巳/亥 are known). */
  pendingTranscription: boolean;
};

/**
 * Resolve a measured bearing into its sitting & facing mountains, and — only
 * for the verified anchors — their hexagrams. `bearingDeg` is the reading off
 * the BACK of the unit (the sitting direction); facing is its opposite.
 */
export function sittingFacingFromBearing(bearingDeg: number): SittingFacing {
  const sittingMountain = mountainForBearing(bearingDeg);
  const facingMountain = oppositeMountain(sittingMountain);
  const sittingHexagram = MOUNTAIN_HEXAGRAM[sittingMountain] ?? null;
  const facingHexagram = MOUNTAIN_HEXAGRAM[facingMountain] ?? null;
  return {
    bearingDeg: ((bearingDeg % 360) + 360) % 360,
    sittingMountain,
    facingMountain,
    sittingHexagram,
    facingHexagram,
    pendingTranscription: sittingHexagram === null,
  };
}

export type DaguaReading =
  | {
      ok: true;
      sitting: SittingFacing;
      // The sitting hexagram drives the line-by-line judgment (research:
      // SHIPPABLE); facing is its bound 180° opposite.
      chart: DaguaChart;
      facingChart: DaguaChart | null;
    }
  | {
      ok: false;
      reason: "pending_transcription";
      sitting: SittingFacing;
      message: string;
    };

/**
 * Full Layer A → Layer B flow: a bearing (+ optional day stem) → the sitting
 * hexagram's chart. Returns a pending result when the bearing falls on a
 * mountain whose hexagram isn't yet transcribed from the luopan.
 */
export function readingFromBearing(
  bearingDeg: number,
  dayStem: Stem | null = null,
): DaguaReading {
  const sitting = sittingFacingFromBearing(bearingDeg);
  if (!sitting.sittingHexagram) {
    return {
      ok: false,
      reason: "pending_transcription",
      sitting,
      message: `Sitting mountain ${sitting.sittingMountain} (${sitting.bearingDeg}°): its hexagram is not yet transcribed from the luopan ring. Only 巳 and 亥 are verified.`,
    };
  }
  return {
    ok: true,
    sitting,
    chart: buildChart(sitting.sittingHexagram, dayStem),
    facingChart: sitting.facingHexagram ? buildChart(sitting.facingHexagram, dayStem) : null,
  };
}
