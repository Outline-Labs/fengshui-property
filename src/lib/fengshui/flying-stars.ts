// Xuan Kong Flying Stars (玄空飞星) — deterministic natal chart (下卦 method).
// Inputs: the unit's facing (one of 8 directions) and construction period.
// This is mathematics, not interpretation — the chart is always reproducible.

export type Dir8 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type Palace = Dir8 | "C";

export type FlyingStarCell = {
  palace: Palace;
  base: number; // period (base) star
  mountain: number; // 山星 — health & relationships
  facing: number; // 向星 — wealth & opportunity
};

export type FlyingStarChart = {
  period: number;
  facing: Dir8;
  sitting: Dir8;
  cells: FlyingStarCell[]; // 9 cells in display order (SE S SW / E C W / NE N NW)
};

// Lo Shu flight path: where successive numbers land, starting from the centre.
const FLIGHT_PATH: Palace[] = ["C", "NW", "W", "NE", "S", "N", "SW", "E", "SE"];

const OPPOSITE: Record<Dir8, Dir8> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
  NE: "SW",
  SW: "NE",
  SE: "NW",
  NW: "SE",
};

// Each Lo Shu digit's home trigram direction (5 has none → centre).
const DIGIT_DIR: Record<number, Palace> = {
  1: "N",
  2: "SW",
  3: "E",
  4: "SE",
  5: "C",
  6: "NW",
  7: "W",
  8: "NE",
  9: "S",
};

// The middle mountain of the diagonal trigrams (艮巽坤乾) is yang → forward flight;
// the cardinals (子卯午酉) are yin → reverse flight.
const DIAGONAL = new Set<Dir8>(["NE", "SE", "SW", "NW"]);

const DISPLAY_ORDER: Palace[] = [
  "SE",
  "S",
  "SW",
  "E",
  "C",
  "W",
  "NE",
  "N",
  "NW",
];

function wrap9(n: number): number {
  return (((n - 1) % 9) + 9) % 9 + 1;
}

function fly(center: number, forward: boolean): Record<Palace, number> {
  const out = {} as Record<Palace, number>;
  let v = center;
  for (const p of FLIGHT_PATH) {
    out[p] = v;
    v = wrap9(forward ? v + 1 : v - 1);
  }
  return out;
}

export function periodFromYear(year?: number): number {
  if (!year || !Number.isFinite(year)) return 9; // current period by default
  const p = Math.floor((year - 1864) / 20) + 1;
  return Math.min(9, Math.max(1, p));
}

// Flight is forward when the governing mountain is yang. For a digit we read its
// home trigram; for 5 (no trigram) we borrow the palace it occupies.
function isForward(digit: number, palace: Dir8): boolean {
  const dir = DIGIT_DIR[digit];
  const d = dir === "C" ? palace : dir;
  return DIAGONAL.has(d as Dir8);
}

export function computeFlyingStars(facing: Dir8, year?: number): FlyingStarChart {
  const period = periodFromYear(year);
  const sitting = OPPOSITE[facing];

  const base = fly(period, true);
  const facingStar = fly(base[facing], isForward(base[facing], facing));
  const mountainStar = fly(base[sitting], isForward(base[sitting], sitting));

  const cells: FlyingStarCell[] = DISPLAY_ORDER.map((p) => ({
    palace: p,
    base: base[p],
    mountain: mountainStar[p],
    facing: facingStar[p],
  }));

  return { period, facing, sitting, cells };
}

export const PERIOD_9_FAVOURABLE = new Set([9, 1, 8]);
export const PERIOD_9_INAUSPICIOUS = new Set([2, 5]);

const DIR8_ALIASES: Record<string, Dir8> = {
  n: "N", north: "N", ne: "NE", northeast: "NE", e: "E", east: "E",
  se: "SE", southeast: "SE", s: "S", south: "S", sw: "SW", southwest: "SW",
  w: "W", west: "W", nw: "NW", northwest: "NW",
};

/** Normalise an 8-direction code ("NE") or label ("Northeast") to a Dir8; null otherwise. */
export function dir8FromString(s: string): Dir8 | null {
  return DIR8_ALIASES[s.trim().toLowerCase()] ?? null;
}

/**
 * Timeliness of a single star in a given period (Period 9 by default). The
 * reigning star (当令) is strongest; 5-yellow (五黄) and 2-black (二黑) are the
 * standing misfortune stars regardless of period.
 */
export function starQuality(star: number, period = 9): number {
  if (star === period) return 2; // 当令最旺
  if (star === 5) return -2; // 五黄 — worst
  if (star === 2) return -1; // 二黑病符
  if (period === 9) return PERIOD_9_FAVOURABLE.has(star) ? 1 : 0; // 1,8 are 生气/进气
  return 0;
}

export type PalaceVerdict = {
  direction: Dir8;
  mountain: number;
  facing: number;
  level: number; // mountain quality + facing quality, ~[-4, 4]
  flags: string[]; // notable conditions, e.g. "五黄", "二五交加"
};

/** Judge one palace (direction) from its mountain (山) and facing (向) stars. */
export function palaceVerdict(chart: FlyingStarChart, dir: Dir8): PalaceVerdict {
  const cell = chart.cells.find((c) => c.palace === dir);
  if (!cell) {
    return { direction: dir, mountain: 0, facing: 0, level: 0, flags: [] };
  }
  const level =
    starQuality(cell.mountain, chart.period) +
    starQuality(cell.facing, chart.period);
  const flags: string[] = [];
  const pair = new Set([cell.mountain, cell.facing]);
  if (pair.has(5)) flags.push("五黄");
  if (pair.has(2) && pair.has(5)) flags.push("二五交加");
  return { direction: dir, mountain: cell.mountain, facing: cell.facing, level, flags };
}
