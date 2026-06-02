// LAYER C — spatial overlay scaffold.
//
// This module does the DETERMINISTIC, method-agnostic geometry only:
//   - 中宫 (centroid) of the unit
//   - each room/feature → its compass sector (12-branch directions, matching the
//     Da Gua chart's per-line directions) so rooms can be tied to chart lines
//   - 青龙/白虎 flanks (split by the centre→door axis)
//   - 明堂 (the entry space the door opens into)
//
// It deliberately does NOT judge. Per the research, the lineage's 旺/衰, 财位,
// and door/stove/bed/toilet rules are BLOCKED (旺衰 needs each hexagram's 卦運,
// hidden in the un-decoded index pair; 财位/placement have no native Xuan Kong
// Da Gua rule — XKDG is classically date-selection). Every such judgment goes
// through the swappable `LineageRules` strategy, whose default returns
// "pending practitioner confirmation" and the exact question to ask — never a
// fabricated verdict to a real user.

import type { DaguaChart, ChartLine } from "./dagua";

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
// Gated lineage rules — the judgment layer. Default returns "pending"; a
// confirmed implementation can be slotted in later without touching the geometry.
// ---------------------------------------------------------------------------
export type Gated = {
  status: "pending";
  reason: string;
  question: string; // the exact question to put to the practitioner
};

export interface LineageRules {
  /** 旺/衰 status of a sector given the chart + period. */
  sectorWangShuai(sector: SectorLabel, chart: DaguaChart, period: number): Gated;
  /** 财位 (wealth position) from the facing hexagram + period. */
  wealthPosition(facing: DaguaChart | null, period: number): Gated;
  /** Placement judgment for a feature (door/stove/bed/toilet) in its sector. */
  placement(feature: "door" | "stove" | "bed" | "toilet", sector: SectorLabel): Gated;
}

export const PENDING_RULES: LineageRules = {
  sectorWangShuai: () => ({
    status: "pending",
    reason:
      "旺/衰 needs each hexagram's 卦運, which is not yet decoded (likely hidden in the 29/84-style index pair).",
    question:
      "What is each hexagram's 卦運 (period number 1–9), and how is it read from the luopan? Under Period 9, is the sitting/facing sector 旺 or 衰?",
  }),
  wealthPosition: () => ({
    status: "pending",
    reason:
      "Xuan Kong Da Gua has no native 财位 rule (it is classically date-selection); the worked example marks only 山/水, never a 财位.",
    question:
      "Does your method produce a 财位? If so, from which inputs (facing hexagram + period, occupant Kua, or door position)?",
  }),
  placement: () => ({
    status: "pending",
    reason:
      "No native XKDG door/stove/bed/toilet rule was found; placement rules belong to other systems (八宅 / 飞星 / 峦头).",
    question:
      "How did you decide 山 vs 水 for each side of the unit — by the sitting hexagram's line elements, by landform, or by each sector's 旺/衰?",
  }),
};

export type SpatialReading = {
  center: PlanPoint;
  rooms: RoomPlacement[];
  flankSummary: { 青龙: string[]; 白虎: string[]; axis: string[] }; // room labels by flank
  mingTang: { room: Room | null; note: string }; // entry space the door opens into
  gated: {
    wangShuaiBySector: Record<string, Gated>;
    wealthPosition: Gated;
  };
};

/**
 * Overlay the (verified) Da Gua chart onto a floorplan. Produces the
 * deterministic facts (sectors, flanks, 明堂, chart-line ties) plus GATED
 * judgments. `rules` defaults to PENDING_RULES so nothing fabricated ships.
 */
export function assembleReading(
  chart: DaguaChart,
  plan: FloorPlan,
  period = 9,
  rules: LineageRules = PENDING_RULES,
): SpatialReading {
  const xAxis = plan.xAxisBearingDeg ?? 90;
  const center = centroid(plan.boundary);

  const rooms: RoomPlacement[] = plan.rooms.map((room) => {
    const bearingDeg = compassBearing(center, room.center, xAxis);
    const sector = branchSectorForBearing(bearingDeg);
    return {
      room,
      bearingDeg,
      sector,
      flank: flankOf(center, plan.door, room.center),
      chartLines: chart.lines.filter((l) => l.direction === sector),
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

  const sectors = Array.from(new Set(rooms.map((r) => r.sector)));
  const wangShuaiBySector: Record<string, Gated> = {};
  for (const s of sectors) wangShuaiBySector[s] = rules.sectorWangShuai(s, chart, period);

  return {
    center,
    rooms,
    flankSummary,
    mingTang: {
      room: mingRoom,
      note:
        "明堂 = the entry space the door opens into; favourable when open/bright. Quantitative sizing (e.g. ~1.5× width) is an unconfirmed heuristic, not a canonical threshold.",
    },
    gated: {
      wangShuaiBySector,
      wealthPosition: rules.wealthPosition(null, period),
    },
  };
}
