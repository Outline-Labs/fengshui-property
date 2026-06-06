// Eight Mansions (八宅) — deterministic 游年 verdict per direction.
//
// This is uncontested classical method (unlike the gated Da Gua 山/水 rules): the
// eight 游星 are a SYMMETRIC relationship between two trigrams, so we encode the
// pairings directly and verify them against the well-known 东四宅/西四宅 layouts.
//
// House gua = the trigram of the unit's SITTING palace (坐山论宅; sitting = the
// direction opposite the facing). Some schools use the occupant's 命卦 instead —
// we use the building, since we have no person data.

import type { Dir8 } from "./flying-stars";

export type EightStar =
  | "生气" | "天医" | "延年" | "伏位" // 吉
  | "祸害" | "六煞" | "五鬼" | "绝命"; // 凶

type Gua = "乾" | "坎" | "艮" | "震" | "巽" | "离" | "坤" | "兑";

const DIR_GUA: Record<Dir8, Gua> = {
  N: "坎", NE: "艮", E: "震", SE: "巽", S: "离", SW: "坤", W: "兑", NW: "乾",
};

const SITTING: Record<Dir8, Dir8> = {
  N: "S", S: "N", E: "W", W: "E", NE: "SW", SW: "NE", SE: "NW", NW: "SE",
};

const EAST_GROUP = new Set<Gua>(["坎", "离", "震", "巽"]);

// Auspiciousness magnitude (+ good / − bad). 生气 & 延年 are the strongest 吉;
// 绝命 & 五鬼 the strongest 凶. Tunable, but the signs are classical.
const LEVEL: Record<EightStar, number> = {
  生气: 3, 延年: 3, 天医: 2, 伏位: 1,
  祸害: -1, 六煞: -2, 五鬼: -3, 绝命: -3,
};

// The 游星 between two guas is symmetric: if A is 生气 to B, B is 生气 to A. We
// list each star's four mutual pairs and expand into a full 8×8 table (伏位 on the
// diagonal). Verified below against 坎宅 / 兑宅.
const PAIRS: Array<[EightStar, Array<[Gua, Gua]>]> = [
  ["延年", [["乾", "坤"], ["坎", "离"], ["震", "巽"], ["艮", "兑"]]],
  ["生气", [["乾", "兑"], ["坤", "艮"], ["坎", "巽"], ["离", "震"]]],
  ["天医", [["乾", "艮"], ["坤", "兑"], ["坎", "震"], ["离", "巽"]]],
  ["绝命", [["乾", "离"], ["坤", "坎"], ["艮", "巽"], ["兑", "震"]]],
  ["五鬼", [["乾", "震"], ["坤", "巽"], ["艮", "离"], ["兑", "坎"]]],
  ["六煞", [["乾", "坎"], ["坤", "离"], ["艮", "震"], ["兑", "巽"]]],
  ["祸害", [["乾", "巽"], ["坤", "震"], ["艮", "坎"], ["兑", "离"]]],
];

const STAR_OF: Record<Gua, Record<Gua, EightStar>> = (() => {
  const guas: Gua[] = ["乾", "坎", "艮", "震", "巽", "离", "坤", "兑"];
  const table = Object.fromEntries(
    guas.map((g) => [g, { [g]: "伏位" } as Record<Gua, EightStar>]),
  ) as Record<Gua, Record<Gua, EightStar>>;
  for (const [star, pairs] of PAIRS) {
    for (const [a, b] of pairs) {
      table[a][b] = star;
      table[b][a] = star;
    }
  }
  return table;
})();

export type MansionVerdict = {
  direction: Dir8;
  star: EightStar;
  auspicious: boolean;
  level: number; // +good / −bad, magnitude 1–3
};

export type EightMansions = {
  facing: Dir8;
  sitting: Dir8;
  houseGua: Gua;
  group: "东四宅" | "西四宅";
  directions: Record<Dir8, MansionVerdict>;
};

const DIR8: Dir8[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Eight-Mansions verdict for each of the 8 directions, from the unit's facing. */
export function eightMansions(facing: Dir8): EightMansions {
  const sitting = SITTING[facing];
  const houseGua = DIR_GUA[sitting];
  const group = EAST_GROUP.has(houseGua) ? "东四宅" : "西四宅";

  const directions = {} as Record<Dir8, MansionVerdict>;
  for (const dir of DIR8) {
    const star = STAR_OF[houseGua][DIR_GUA[dir]];
    directions[dir] = {
      direction: dir,
      star,
      auspicious: LEVEL[star] > 0,
      level: LEVEL[star],
    };
  }
  return { facing, sitting, houseGua, group, directions };
}

export function eightStarLevel(star: EightStar): number {
  return LEVEL[star];
}
