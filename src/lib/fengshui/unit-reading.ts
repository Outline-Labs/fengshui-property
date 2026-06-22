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

// ---------------------------------------------------------------------------
// 青龙白虎 (form-school flanks) — interior 龙动虎静.
// Standing at the centre looking out the front (the facing), a sector to the
// LEFT of that axis is 青龙 (dragon, yang, should be active); to the RIGHT is
// 白虎 (tiger, yin, should stay quiet). Mirrors spatial.flankOf in compass space
// (the floor-plan engine works from sectors, not x/y geometry). This is the
// FORM-school 青龙白虎 — unrelated to the six-gods of the same name.
// ---------------------------------------------------------------------------
type Flank = "青龙" | "白虎" | "axis";

const DIR8_DEG: Record<Dir8, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
};

export function flankOfSector(facing: Dir8, sector: Dir8): Flank {
  // Signed offset of the sector from the facing axis, normalised to (-180, 180].
  const offset =
    ((((DIR8_DEG[sector] - DIR8_DEG[facing]) % 360) + 540) % 360) - 180;
  if (offset === 0 || Math.abs(offset) === 180) return "axis"; // dead ahead / behind
  return offset < 0 ? "青龙" : "白虎"; // left of the facing axis = dragon
}

// How 动/yang each room is — how much it WANTS the active 青龙 side. Negative =
// 静/yin, content on the quiet 白虎. A product knob, like the score weights; the
// 龙动虎静 direction itself is classical.
const ROOM_ACTIVITY: Record<RoomKind, number> = {
  kitchen: 1.0, // 灶 — fire, the most active
  living: 0.8,
  entrance: 0.7, // 气口
  dining: 0.6,
  study: 0.5,
  master: 0.3,
  bedroom: -0.4, // rest — yin
  bathroom: -0.3, // yin
  other: 0,
};

// Modest, tunable weights — the flank nudges the score, it doesn't dominate it
// (the 玄空飞星/八宅 core moves it ±5).
const FLANK_NORM = 1.5; // activity gap that saturates the [-1,1] quality
const FLANK_WEIGHT = 0.8; // max ± points the balance moves the 0–10 score
const TIGER_STOVE_PENALTY = 0.6; // extra drop for a stove on the 白虎 (白虎煞)

export type FlankAssessment = {
  quality: number; // [-1,1]: + = 龙动虎静 (good), − = 白虎抬头 (tiger over-strong)
  dragon: string[]; // room labels on the 青龙 side
  tiger: string[]; // room labels on the 白虎 side
  tigerStove: boolean; // a stove sits on the 白虎 side → 白虎煞
  factors: FloorPlanFactor[]; // the 峦头 factor(s) this produces
};

// The balance is a secondary signal — capped at 2; severity 3 is reserved for
// the specific 白虎煞 (stove on the tiger).
function flankSeverity(quality: number): 1 | 2 {
  return Math.abs(quality) >= 0.6 ? 2 : 1;
}

/**
 * Interior 青龙白虎 from (facing, rooms): which flank each room falls on, the
 * activity balance between the two sides, and the 峦头 factor(s) it yields. Pure.
 */
export function assessFlanks(facing: Dir8, rooms: RoomInput[]): FlankAssessment {
  let dragonAct = 0;
  let tigerAct = 0;
  const dragon: string[] = [];
  const tiger: string[] = [];
  let tigerStove = false;

  for (const room of rooms) {
    const dir = DIR8.includes(room.sector as Dir8) ? (room.sector as Dir8) : null;
    if (!dir) continue;
    const flank = flankOfSector(facing, dir);
    if (flank === "axis") continue;
    const kind = classifyRoom(room.name);
    if (flank === "青龙") {
      dragonAct += ROOM_ACTIVITY[kind];
      dragon.push(ROOM_LABEL[kind]);
    } else {
      tigerAct += ROOM_ACTIVITY[kind];
      tiger.push(ROOM_LABEL[kind]);
      if (kind === "kitchen") tigerStove = true;
    }
  }

  const quality = Math.max(-1, Math.min(1, (dragonAct - tigerAct) / FLANK_NORM));
  const factors: FloorPlanFactor[] = [];
  // No room on either flank → nothing to say.
  if (dragon.length || tiger.length) {
    factors.push(balanceFactor(quality, dragon, tiger));
    if (tigerStove) factors.push(tigerStoveFactor());
  }

  return { quality, dragon, tiger, tigerStove, factors };
}

function balanceFactor(
  quality: number,
  dragon: string[],
  tiger: string[],
): FloorPlanFactor {
  const sides =
    `青龙 (left): ${dragon.length ? dragon.join("、") : "—"}; ` +
    `白虎 (right): ${tiger.length ? tiger.join("、") : "—"}.`;
  if (quality >= 0.15) {
    return {
      type: "positive",
      severity: flankSeverity(quality),
      title: "青龙白虎 · 龙动虎静",
      principle: "峦头",
      description: `Activity weights to the 青龙 (left/dragon) side while the 白虎 (right/tiger) stays quieter — the favourable 龙动虎静. ${sides}`,
    };
  }
  if (quality <= -0.15) {
    return {
      type: "negative",
      severity: flankSeverity(quality),
      title: "青龙白虎 · 白虎抬头",
      principle: "峦头",
      description: `The 白虎 (right/tiger) side carries more activity than the 青龙 (left/dragon) — 白虎抬头, classically linked to friction and instability. Move active rooms toward the dragon side or keep the tiger quieter. ${sides}`,
    };
  }
  return {
    type: "positive",
    severity: 1,
    title: "青龙白虎 · 均衡",
    principle: "峦头",
    description: `The 青龙 (dragon) and 白虎 (tiger) sides are roughly balanced; doctrine prefers the dragon to lead slightly. ${sides}`,
  };
}

function tigerStoveFactor(): FloorPlanFactor {
  return {
    type: "negative",
    severity: 3,
    title: "白虎煞 · 灶居白虎",
    principle: "峦头",
    description:
      "The stove sits on the 白虎 (right/tiger) side — fire on the tiger (白虎煞), classically associated with arguments, accidents and health strain. Relocating the stove toward the 青龙 side or a quieter sector is the standard remedy.",
  };
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

  // 青龙白虎 (form-school): a modest adjustment on top of the 八宅/玄空 base.
  const flank = assessFlanks(facing, rooms);
  let adj = FLANK_WEIGHT * flank.quality;
  if (flank.tigerStove) adj -= TIGER_STOVE_PENALTY;
  const score = Math.max(
    0,
    Math.min(10, Math.round((5 + 5 * wavg + adj) * 10) / 10),
  );

  // Always surface the 青龙白虎 factor(s); fill the rest with the most
  // significant room factors (by severity), capped to keep the noise down.
  const roomFactors = factors
    .sort((a, b) => b.severity - a.severity)
    .slice(0, Math.max(0, 7 - flank.factors.length));
  const trimmed = [...flank.factors, ...roomFactors].sort(
    (a, b) => b.severity - a.severity,
  );

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
