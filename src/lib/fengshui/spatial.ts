// LAYER C — spatial overlay.
//
// Deterministic geometry (method-agnostic):
//   - 中宫 (centroid) of the unit
//   - each room/feature → its compass sector (12-branch), tied to chart lines
//   - 青龙/白虎 flanks (split by the centre→door axis)
//   - 明堂 (the entry space the door opens into)
//
// Judgment is now produced by INFERRED_RULES — the rules we decoded from the
// master's charts (卦運 via the XT_LS rule in dagua.ts) and reasoned from
// classical doctrine. They are tagged `inferred: true` because the practitioner
// has NOT yet confirmed them. The Da Gua engine is not wired to any consumer
// route, so these don't reach users. PENDING_RULES (no verdict, just the
// question to ask) remains available as the conservative opt-out.
//
// Inferred rules (pending master confirmation):
//   - 旺/衰: a sector is 旺 when its ring hexagram's 卦運 == the current 運
//     (當令為旺); 失令為衰. The 合十 complement 運 (運1 in Period 9) is the 零神.
//   - 山/水 requirement: 正神 (旺) wants 山 (山管人丁); 零神 wants 水 (水管财).
//   - 财位: the 零神 directions (the water/wealth positions).
//   - placement: door/stove/bed favour 旺 sectors; toilets favour 衰 (drain
//     decline, never flush a 旺 sector).
// CAVEAT: the worked example's hand-marked 山/水 read as OBSERVED landform and do
// not cleanly track this 旺衰 mapping, so the 山/水 *requirement* especially needs
// the master's confirmation.

import { type DaguaChart, type ChartLine, guaYun } from "./dagua";
import { hexagramForBearing } from "./bearing";

// Floorplan coordinate frame: points are (x, y); +x points to compass
// `xAxisBearingDeg`, and +y is 90° counter-clockwise from +x (i.e. with the
// default xAxisBearingDeg = 90, +x = East and +y = North — a standard map).
export type PlanPoint = { x: number; y: number };

export type Room = {
  id: string;
  label: string; // "bedroom" | "kitchen" | "bath" | "living" | "balcony" | …
  center: PlanPoint;
};

export type FloorPlan = {
  boundary: PlanPoint[]; // outer wall polygon (>= 3 points)
  rooms: Room[];
  door: PlanPoint; // main door (纳气口)
  xAxisBearingDeg?: number; // compass bearing of +x; default 90 (map orientation)
  features?: {
    stove?: PlanPoint;
    beds?: PlanPoint[];
    toilets?: PlanPoint[];
  };
};

// 12 earthly-branch directions (30° bands) — the SAME labels the Da Gua chart
// lines carry, so a room's sector can be matched to the chart lines there.
const BRANCH_DIRS = [
  "N", "NNE", "ENE", "E", "ESE", "SSE", "S", "SSW", "WSW", "W", "WNW", "NNW",
] as const;
export type SectorLabel = (typeof BRANCH_DIRS)[number];

export function branchSectorForBearing(deg: number): SectorLabel {
  const norm = ((deg % 360) + 360) % 360;
  return BRANCH_DIRS[Math.round(norm / 30) % 12];
}

/** Area-weighted centroid (中宫) of the outer-boundary polygon. */
export function centroid(boundary: PlanPoint[]): PlanPoint {
  if (boundary.length < 3) {
    // Degenerate: fall back to the vertex average.
    const n = boundary.length || 1;
    return {
      x: boundary.reduce((s, p) => s + p.x, 0) / n,
      y: boundary.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < boundary.length; i++) {
    const p = boundary[i];
    const q = boundary[(i + 1) % boundary.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (a === 0) {
    const n = boundary.length;
    return {
      x: boundary.reduce((s, p) => s + p.x, 0) / n,
      y: boundary.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Compass bearing (0–360) from `from` to `to` in the plan's frame. */
export function compassBearing(
  from: PlanPoint,
  to: PlanPoint,
  xAxisBearingDeg = 90,
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mathDeg = (Math.atan2(dy, dx) * 180) / Math.PI; // CCW from +x
  return ((xAxisBearingDeg - mathDeg) % 360 + 360) % 360;
}

export type Flank = "青龙" | "白虎" | "axis";

/**
 * Standing at the centroid facing the door: left flank = 青龙 (dragon, yang,
 * active), right flank = 白虎 (tiger, yin, quiet). This is the FORM-school
 * 青龙/白虎 — unrelated to the six-gods 青龙/白虎 the chart places on lines.
 */
export function flankOf(
  center: PlanPoint,
  door: PlanPoint,
  point: PlanPoint,
  epsilon = 1e-9,
): Flank {
  const ax = door.x - center.x;
  const ay = door.y - center.y;
  const rx = point.x - center.x;
  const ry = point.y - center.y;
  const cross = ax * ry - ay * rx; // >0 = left of the facing axis
  if (Math.abs(cross) <= epsilon) return "axis";
  return cross > 0 ? "青龙" : "白虎";
}

export type RoomPlacement = {
  room: Room;
  bearingDeg: number;
  sector: SectorLabel;
  flank: Flank;
  // The chart lines (if any) whose direction matches this room's sector — the
  // factual tie between geometry and the 理气 substrate. NOT a judgment.
  chartLines: ChartLine[];
};

// ---------------------------------------------------------------------------
// The judgment layer (swappable strategy).
// ---------------------------------------------------------------------------
export type SectorVerdict = {
  /** 旺 (prosperous, 當令) / 衰 (declining, 失令) / pending (no verdict). */
  status: "旺" | "衰" | "pending";
  hexagram?: string;
  guaYun?: number;
  role?: "正神" | "零神" | "退氣";
  /** What classical doctrine says the sector should hold: 山 (人丁) / 水 (财). */
  wants?: "山" | "水" | null;
  /** true when produced by our decoded rule (pending master confirmation). */
  inferred?: boolean;
  note: string;
};

export type Placement = {
  feature: "door" | "stove" | "bed" | "toilet";
  favorable: boolean | null; // null = pending
  note: string;
};

export interface LineageRules {
  sectorWangShuai(bearingDeg: number, period: number): SectorVerdict;
  /** Bearings (slice centres) of the 财位 — the 零神/water-wealth directions. */
  wealthBearings(period: number): { bearings: number[]; note: string };
  placement(feature: Placement["feature"], verdict: SectorVerdict): Placement;
}

/** Conservative opt-out: emit no verdict, only the question to ask the master. */
export const PENDING_RULES: LineageRules = {
  sectorWangShuai: () => ({
    status: "pending",
    note: "旺/衰 verdict withheld — pending practitioner confirmation of the rule.",
  }),
  wealthBearings: () => ({ bearings: [], note: "财位 pending practitioner confirmation." }),
  placement: (feature) => ({ feature, favorable: null, note: "Placement pending confirmation." }),
};

/**
 * INFERRED rules (decoded + reasoned, NOT master-confirmed). 旺 when the
 * sector's ring hexagram 卦運 == current 運; 山 for 正神 / 水 for 零神; 财位 =
 * the 零神 directions; placement favours 旺 (toilets favour 衰).
 */
export const INFERRED_RULES: LineageRules = {
  sectorWangShuai(bearingDeg, period) {
    const hexagram = hexagramForBearing(bearingDeg);
    const y = guaYun(hexagram);
    const zeroShen = 10 - period; // 合十 complement (Period 9 → 零神 運1)
    const status = y === period ? "旺" : "衰";
    const role = y === period ? "正神" : y === zeroShen ? "零神" : "退氣";
    const wants = role === "正神" ? "山" : role === "零神" ? "水" : null;
    return {
      status,
      hexagram,
      guaYun: y,
      role,
      wants,
      inferred: true,
      note: `${hexagram} 卦運${y} · 運${period}: ${role} → ${status}${wants ? ` (wants ${wants})` : ""}`,
    };
  },
  wealthBearings(period) {
    const zeroShen = 10 - period;
    const bearings: number[] = [];
    for (let k = 0; k < 64; k++) {
      const deg = k * (360 / 64);
      if (guaYun(hexagramForBearing(deg)) === zeroShen) bearings.push(deg);
    }
    return { bearings, note: `财位 = 零神 (運${zeroShen}) directions — water governs wealth. INFERRED.` };
  },
  placement(feature, verdict) {
    if (verdict.status === "pending") return { feature, favorable: null, note: "pending" };
    const wang = verdict.status === "旺";
    // Toilets drain their sector: good in 衰, bad in 旺 (flushes prosperity).
    const favorable = feature === "toilet" ? !wang : wang;
    const why =
      feature === "toilet"
        ? wang ? "a toilet in a 旺 sector flushes prosperity" : "a toilet in a 衰 sector drains decline (good)"
        : wang ? `a ${feature} in a 旺 sector draws prosperous qi` : `a ${feature} in a 衰 sector sits on declining qi`;
    return { feature, favorable, note: `${why}. INFERRED.` };
  },
};

export type SpatialReading = {
  center: PlanPoint;
  rooms: (RoomPlacement & { wangShuai: SectorVerdict })[];
  flankSummary: { 青龙: string[]; 白虎: string[]; axis: string[] };
  mingTang: { room: Room | null; note: string };
  /** Per-feature placement verdicts (only for features present in the plan). */
  placements: Placement[];
  wealth: { bearings: number[]; note: string };
  /** Whether the judgments are inferred (pending master) vs withheld. */
  inferred: boolean;
};

/**
 * Overlay the (verified) Da Gua chart onto a floorplan: deterministic geometry
 * (sectors, flanks, 明堂, chart-line ties) plus the rule layer's verdicts.
 * Defaults to INFERRED_RULES (tagged inferred); pass PENDING_RULES to withhold.
 */
export function assembleReading(
  chart: DaguaChart,
  plan: FloorPlan,
  period = 9,
  rules: LineageRules = INFERRED_RULES,
): SpatialReading {
  const xAxis = plan.xAxisBearingDeg ?? 90;
  const center = centroid(plan.boundary);

  const rooms = plan.rooms.map((room) => {
    const bearingDeg = compassBearing(center, room.center, xAxis);
    const sector = branchSectorForBearing(bearingDeg);
    return {
      room,
      bearingDeg,
      sector,
      flank: flankOf(center, plan.door, room.center),
      chartLines: chart.lines.filter((l) => l.direction === sector),
      wangShuai: rules.sectorWangShuai(bearingDeg, period),
    };
  });

  const flankSummary = { 青龙: [] as string[], 白虎: [] as string[], axis: [] as string[] };
  for (const r of rooms) flankSummary[r.flank].push(r.room.label);

  // 明堂: the room the door opens into (nearest room centre to the door).
  let mingRoom: Room | null = null;
  let best = Infinity;
  for (const room of plan.rooms) {
    const d = (room.center.x - plan.door.x) ** 2 + (room.center.y - plan.door.y) ** 2;
    if (d < best) {
      best = d;
      mingRoom = room;
    }
  }

  // Placement verdicts for the physical features present in the plan.
  const placements: Placement[] = [];
  const f = plan.features;
  if (f) {
    const verdictAt = (p: PlanPoint) =>
      rules.sectorWangShuai(compassBearing(center, p, xAxis), period);
    if (f.stove) placements.push(rules.placement("stove", verdictAt(f.stove)));
    for (const bed of f.beds ?? []) placements.push(rules.placement("bed", verdictAt(bed)));
    for (const wc of f.toilets ?? []) placements.push(rules.placement("toilet", verdictAt(wc)));
  }
  placements.push(rules.placement("door", rules.sectorWangShuai(compassBearing(center, plan.door, xAxis), period)));

  return {
    center,
    rooms,
    flankSummary,
    mingTang: {
      room: mingRoom,
      note:
        "明堂 = the entry space the door opens into; favourable when open/bright. Quantitative sizing (e.g. ~1.5× width) is an unconfirmed heuristic, not a canonical threshold.",
    },
    placements,
    wealth: rules.wealthBearings(period),
    inferred: rules === INFERRED_RULES,
  };
}
