// LAYER A — compass bearing → hexagram (sitting & facing).
//
// The luopan's inner ring is the 先天六十四卦圆图 (Fu Xi circular order): 復 at
// true north (0°), advancing clockwise, each hexagram occupying a 5.625° slice
// (360/64). The ring + per-hexagram source metadata live in ./dagua-source.ts,
// reconstructed from the master's charts and cross-validated (A's slice order ×
// B's placement agree on all 64; opposite slices are 错卦 with 0 failures;
// anchors hold). The 24-mountain ring (15° each) is kept as a coarse label.
//
// STILL GATED: each hexagram's 卦運 is transcribed but ~4 values are suspect
// (see SUSPECT_GUAYUN), and the index-pair meaning is undecoded — so 旺/衰 and
// anything 卦運-driven stays gated in spatial.ts until the practitioner confirms.

import { type DaguaChart, type Stem, buildChart } from "./dagua";
import { type HexSourceMeta, HEX_SOURCE, RING } from "./dagua-source";

export const SLICE_DEG = 360 / 64; // 5.625°

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
  return MOUNTAINS[Math.round(norm / 15) % 24];
}

/** The diametrically-opposite mountain (sitting ↔ facing). */
export function oppositeMountain(m: Mountain): Mountain {
  return MOUNTAINS[(MOUNTAINS.indexOf(m) + 12) % 24];
}

/**
 * The hexagram occupying the 5.625° slice that contains `deg`. Validated against
 * the source ring and the worked example (155° → 风天小畜; 150° → 水天需 — both
 * inside the 巳 mountain, which is why a bearing, not just a mountain, is needed
 * to pick the exact hexagram).
 */
export function hexagramForBearing(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  return RING[Math.floor(norm / SLICE_DEG) % 64];
}

/** The luopan source metadata (index pair + 卦運) for a hexagram, or null. */
export function hexSource(hexagram: string): HexSourceMeta | null {
  return HEX_SOURCE[hexagram] ?? null;
}

export type SittingFacing = {
  bearingDeg: number;
  sittingMountain: Mountain;
  facingMountain: Mountain;
  sittingHexagram: string;
  facingHexagram: string; // the 180° opposite — always the sitting's 错卦
};

/**
 * Resolve a measured bearing (read off the BACK of the unit — the sitting
 * direction) into its sitting & facing mountains and hexagrams.
 */
export function sittingFacingFromBearing(bearingDeg: number): SittingFacing {
  const norm = ((bearingDeg % 360) + 360) % 360;
  const sittingMountain = mountainForBearing(norm);
  return {
    bearingDeg: norm,
    sittingMountain,
    facingMountain: oppositeMountain(sittingMountain),
    sittingHexagram: hexagramForBearing(norm),
    facingHexagram: hexagramForBearing(norm + 180),
  };
}

export type DaguaReading = {
  sitting: SittingFacing;
  // The sitting hexagram drives the line-by-line judgment (research: SHIPPABLE);
  // the facing chart is its bound 180° opposite.
  chart: DaguaChart;
  facingChart: DaguaChart;
};

/**
 * Full Layer A → Layer B flow: a bearing (+ optional day stem) → the sitting
 * hexagram's Da Gua chart and its facing complement. Resolves for any bearing.
 */
export function readingFromBearing(
  bearingDeg: number,
  dayStem: Stem | null = null,
): DaguaReading {
  const sitting = sittingFacingFromBearing(bearingDeg);
  return {
    sitting,
    chart: buildChart(sitting.sittingHexagram, dayStem),
    facingChart: buildChart(sitting.facingHexagram, dayStem),
  };
}
