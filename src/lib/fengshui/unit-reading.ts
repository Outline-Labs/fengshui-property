// Deterministic unit reading — the engine that judges a floor plan from the two
// UNCONTESTED schools (Flying Stars 玄空飞星 + Eight Mansions 八宅). Given the
// facing, the period (from year built), and which sector each room sits in, it
// computes a reproducible score and structured factors — no LLM opinion. The LLM
// only supplies the perception (room → sector) and form-school visual notes.
//
// The score weights are a product knob (like form-school.ts), but the per-sector
// 吉/凶 signs are classical, not invented.

import {
  type Dir8,
  type FlyingStarChart,
  type PalaceVerdict,
  computeFlyingStars,
  palaceVerdict,
} from "./flying-stars";
import {
  type EightMansions,
  type MansionVerdict,
  eightMansions,
} from "./eight-mansions";
import type { FloorPlanFactor } from "../types";

export type RoomInput = { name: string; sector: string };

type RoomKind =
  | "kitchen" | "master" | "bedroom" | "living" | "dining"
  | "study" | "bathroom" | "entrance" | "other";

// How much each room type moves the score, and whether its sector logic inverts
// (a toilet WANTS a 凶 sector — 八宅: 厕占凶方以压煞).
const ROOM_RULES: Record<RoomKind, { weight: number; invert: boolean }> = {
  kitchen: { weight: 1.0, invert: false }, // 灶 — wealth + health
  master: { weight: 1.0, invert: false },
  entrance: { weight: 1.0, invert: false }, // 气口
  living: { weight: 0.7, invert: false },
  bedroom: { weight: 0.6, invert: false },
  study: { weight: 0.5, invert: false },
  dining: { weight: 0.4, invert: false },
  bathroom: { weight: 0.6, invert: true }, // 厕所宜居凶方
  other: { weight: 0.3, invert: false },
};

function classifyRoom(name: string): RoomKind {
  const n = name.toLowerCase();
  if (/(kitchen|stove|hob|厨|灶)/.test(n)) return "kitchen";
  if (/(master|主卧|主人|主)/.test(n) && /(bed|room|卧|房)/.test(n)) return "master";
  if (/(bath|toilet|wc|washroom|powder|卫|厕|洗手)/.test(n)) return "bathroom";
  if (/(bed|bedroom|卧|睡)/.test(n)) return "bedroom";
  if (/(living|lounge|hall|客厅|厅|起居)/.test(n)) return "living";
  if (/(dining|餐)/.test(n)) return "dining";
  if (/(study|office|书房|工作)/.test(n)) return "study";
  if (/(entrance|foyer|entry|门厅|玄关)/.test(n)) return "entrance";
  return "other";
}

const ROOM_LABEL: Record<RoomKind, string> = {
  kitchen: "Kitchen", master: "Master bedroom", bedroom: "Bedroom",
  living: "Living room", dining: "Dining", study: "Study",
  bathroom: "Bathroom", entrance: "Entrance", other: "Room",
};

// Combined sector quality in [-1, 1]: 八宅 and 玄空飞星 each contribute half.
function sectorQuality(mansion: MansionVerdict, palace: PalaceVerdict): number {
  const m = mansion.level / 3; // [-1, 1]
  const f = Math.max(-1, Math.min(1, palace.level / 4)); // [-1, 1]
  return (m + f) / 2;
}

export type SectorVerdict = {
  direction: Dir8;
  mansion: MansionVerdict;
  palace: PalaceVerdict;
  quality: number; // [-1, 1]
};

export type UnitReading = {
  facing: Dir8;
  period: number;
  group: EightMansions["group"];
  houseGua: string;
  auspicious: Dir8[]; // 八宅 吉方
  inauspicious: Dir8[]; // 八宅 凶方
  score: number; // 0–10, deterministic
  sectors: Record<Dir8, SectorVerdict>;
  factors: FloorPlanFactor[];
  chart: FlyingStarChart;
};

const DIR_LABEL: Record<Dir8, string> = {
  N: "north", NE: "northeast", E: "east", SE: "southeast",
  S: "south", SW: "southwest", W: "west", NW: "northwest",
};
const DIR8: Dir8[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function severityFromLevel(level: number): 1 | 2 | 3 {
  const a = Math.abs(level);
  if (a >= 3) return 3;
  if (a >= 2) return 2;
  return 1;
}

/**
 * The deterministic reading. `rooms` come from perception (the LLM or a confirmed
 * layout); everything here is pure computation from (facing, period, rooms).
 */
export function computeUnitReading(
  facing: Dir8,
  year: number | undefined,
  rooms: RoomInput[],
): UnitReading {
  const chart = computeFlyingStars(facing, year);
  const mansions = eightMansions(facing);

  const sectors = {} as Record<Dir8, SectorVerdict>;
  for (const dir of DIR8) {
    const mansion = mansions.directions[dir];
    const palace = palaceVerdict(chart, dir);
    sectors[dir] = { direction: dir, mansion, palace, quality: sectorQuality(mansion, palace) };
  }

  // Score: weighted average sector quality over the rooms we could place, mapped
  // to 0–10 around a neutral 5. Room-count independent.
  let wSum = 0;
  let qSum = 0;
  const factors: FloorPlanFactor[] = [];

  for (const room of rooms) {
    const dir = DIR8.includes(room.sector as Dir8) ? (room.sector as Dir8) : null;
    if (!dir) continue; // center / unknown sector — no directional verdict
    const kind = classifyRoom(room.name);
    const rule = ROOM_RULES[kind];
    const sv = sectors[dir];
    const signed = rule.invert ? -sv.quality : sv.quality;

    wSum += rule.weight;
    qSum += rule.weight * signed;

    factors.push(roomFactor(room.name, kind, rule.invert, dir, sv));
  }

  const wavg = wSum > 0 ? qSum / wSum : 0;
  const score = Math.max(0, Math.min(10, Math.round((5 + 5 * wavg) * 10) / 10));

  // Keep the most significant factors (by severity), cap the noise.
  factors.sort((a, b) => b.severity - a.severity);
  const trimmed = factors.slice(0, 7);

  return {
    facing,
    period: chart.period,
    group: mansions.group,
    houseGua: mansions.houseGua,
    auspicious: DIR8.filter((d) => mansions.directions[d].auspicious),
    inauspicious: DIR8.filter((d) => !mansions.directions[d].auspicious),
    score,
    sectors,
    factors: trimmed,
    chart,
  };
}

function roomFactor(
  name: string,
  kind: RoomKind,
  invert: boolean,
  dir: Dir8,
  sv: SectorVerdict,
): FloorPlanFactor {
  const star = sv.mansion.star;
  const auspicious8m = sv.mansion.auspicious;
  // For most rooms, an auspicious sector is positive. For a bathroom it inverts.
  const positive = invert ? !auspicious8m : auspicious8m;
  let severity = severityFromLevel(sv.mansion.level);
  const flags = sv.palace.flags;
  if (!invert && flags.length) severity = 3; // 五黄/二五交加 on a living space is serious

  const where = `${DIR_LABEL[dir]} (${dir})`;
  const fs = `flying stars 山${sv.palace.mountain}/向${sv.palace.facing}${flags.length ? ` — ${flags.join("、")}` : ""}`;
  const label = ROOM_LABEL[kind];

  let description: string;
  if (invert) {
    description = positive
      ? `${label} sits in the ${where} ${star} (凶) sector — which is actually where a bathroom belongs, as it presses down the inauspicious qi (八宅). ${fs}.`
      : `${label} sits in the ${where} ${star} (吉) sector; a bathroom here wastes an auspicious direction and can drain its benefit (八宅). ${fs}.`;
  } else {
    description = positive
      ? `${label} sits in the ${where} ${star} (吉) sector — a favourable placement (八宅). ${fs}.`
      : `${label} sits in the ${where} ${star} (凶) sector — an unfavourable placement (八宅). ${fs}.`;
  }

  return {
    type: positive ? "positive" : "negative",
    severity,
    title: `${label} · ${star}`,
    principle: flags.length ? "玄空飞星" : "八宅",
    description,
  };
}
