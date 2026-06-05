// Xuan Kong Da Gua (玄空大卦) — deterministic najia / six-yao chart engine.
//
// Given a hexagram (one of the 64) and an optional day stem, this produces the
// hexagram's six lines, each carrying its najia (天干地支), its 世/应 role, its
// six god (六神, only when a day stem is supplied), and a compass direction +
// five-element from its earthly branch — plus hexagram-level palace, palace
// element, transformation type, and 元神. This is mathematics, not
// interpretation: the chart is fully reproducible.
//
// LAYER B in the engine spec. The constants below are derived from classical
// najia rules and proven against two ground truths (the practitioner's
// handwritten 小畜 chart and the source book's 元神 footnote — see dagua.test.ts).
// Do NOT "improve" the constants; port-and-verify only.
//
// This module is the substrate for Layer C (spatial/environmental analysis): it
// emits, per line, a (direction, element, role, six-god) tuple as structured
// data. Layer A (bearing → hexagram) and Layer C are not implemented here.

export type Trigram = "乾" | "兑" | "离" | "震" | "巽" | "坎" | "艮" | "坤";
export type Palace = Trigram; // palaces are named by their pure trigram
export type Element = "金" | "木" | "水" | "火" | "土";
export type Stem =
  | "甲" | "乙" | "丙" | "丁" | "戊" | "己" | "庚" | "辛" | "壬" | "癸";
export type Branch =
  | "子" | "丑" | "寅" | "卯" | "辰" | "巳"
  | "午" | "未" | "申" | "酉" | "戌" | "亥";
export type SixGod = "青龙" | "朱雀" | "勾陈" | "螣蛇" | "白虎" | "玄武";
export type Transformation =
  | "本宫" | "一世" | "二世" | "三世" | "四世" | "五世" | "游魂" | "归魂";

type TrigramData = {
  lines: readonly [number, number, number]; // bottom→top; 1=yang/solid, 0=yin/broken
  stemLower: Stem;
  stemUpper: Stem;
  brLower: readonly [Branch, Branch, Branch]; // when this trigram is the inner (lines 1–3)
  brUpper: readonly [Branch, Branch, Branch]; // when this trigram is the outer (lines 4–6)
  element: Element;
};

// §4.1 — najia source of truth. Only 乾/坤 differ in stem between inner/outer.
const TRIGRAMS: Record<Trigram, TrigramData> = {
  乾: { lines: [1, 1, 1], stemLower: "甲", stemUpper: "壬", brLower: ["子", "寅", "辰"], brUpper: ["午", "申", "戌"], element: "金" },
  兑: { lines: [1, 1, 0], stemLower: "丁", stemUpper: "丁", brLower: ["巳", "卯", "丑"], brUpper: ["亥", "酉", "未"], element: "金" },
  离: { lines: [1, 0, 1], stemLower: "己", stemUpper: "己", brLower: ["卯", "丑", "亥"], brUpper: ["酉", "未", "巳"], element: "火" },
  震: { lines: [1, 0, 0], stemLower: "庚", stemUpper: "庚", brLower: ["子", "寅", "辰"], brUpper: ["午", "申", "戌"], element: "木" },
  巽: { lines: [0, 1, 1], stemLower: "辛", stemUpper: "辛", brLower: ["丑", "亥", "酉"], brUpper: ["未", "巳", "卯"], element: "木" },
  坎: { lines: [0, 1, 0], stemLower: "戊", stemUpper: "戊", brLower: ["寅", "辰", "午"], brUpper: ["申", "戌", "子"], element: "水" },
  艮: { lines: [0, 0, 1], stemLower: "丙", stemUpper: "丙", brLower: ["辰", "午", "申"], brUpper: ["戌", "子", "寅"], element: "土" },
  坤: { lines: [0, 0, 0], stemLower: "乙", stemUpper: "癸", brLower: ["未", "巳", "卯"], brUpper: ["丑", "亥", "酉"], element: "土" },
};

// §4.4 — branch → compass bearing (sector centre) + five-element.
const BRANCH_DIR: Record<Branch, number> = {
  子: 0, 丑: 30, 寅: 60, 卯: 90, 辰: 120, 巳: 150,
  午: 180, 未: 210, 申: 240, 酉: 270, 戌: 300, 亥: 330,
};
const BRANCH_ELEMENT: Record<Branch, Element> = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};
const DIR_LABEL: Record<number, string> = {
  0: "N", 30: "NNE", 60: "ENE", 90: "E", 120: "ESE", 150: "SSE",
  180: "S", 210: "SSW", 240: "WSW", 270: "W", 300: "WNW", 330: "NNW",
};

// §4.2 — eight palaces; array order IS the transformation sequence (index 0–7).
const PALACE_ORDER: Record<Palace, readonly string[]> = {
  乾: ["乾为天", "天风姤", "天山遁", "天地否", "风地观", "山地剥", "火地晋", "火天大有"],
  坎: ["坎为水", "水泽节", "水雷屯", "水火既济", "泽火革", "雷火丰", "地火明夷", "地水师"],
  艮: ["艮为山", "山火贲", "山天大畜", "山泽损", "火泽睽", "天泽履", "风泽中孚", "风山渐"],
  震: ["震为雷", "雷地豫", "雷水解", "雷风恒", "地风升", "水风井", "泽风大过", "泽雷随"],
  巽: ["巽为风", "风天小畜", "风火家人", "风雷益", "天雷无妄", "火雷噬嗑", "山雷颐", "山风蛊"],
  离: ["离为火", "火山旅", "火风鼎", "火水未济", "山水蒙", "风水涣", "天水讼", "天火同人"],
  坤: ["坤为地", "地雷复", "地泽临", "地天泰", "雷天大壮", "泽天夬", "水天需", "水地比"],
  兑: ["兑为泽", "泽水困", "泽地萃", "泽山咸", "水山蹇", "地山谦", "雷山小过", "雷泽归妹"],
};
const WORLD_LINE_BY_INDEX = [6, 1, 2, 3, 4, 5, 4, 3] as const;
const TRANSFORMATION: readonly Transformation[] = [
  "本宫", "一世", "二世", "三世", "四世", "五世", "游魂", "归魂",
];

// §6 — each hexagram's (upper, lower) trigram pair.
const HEXAGRAM_TRIGRAMS: Record<string, readonly [Trigram, Trigram]> = {
  乾为天: ["乾", "乾"], 天风姤: ["乾", "巽"], 天山遁: ["乾", "艮"], 天地否: ["乾", "坤"],
  风地观: ["巽", "坤"], 山地剥: ["艮", "坤"], 火地晋: ["离", "坤"], 火天大有: ["离", "乾"],
  坎为水: ["坎", "坎"], 水泽节: ["坎", "兑"], 水雷屯: ["坎", "震"], 水火既济: ["坎", "离"],
  泽火革: ["兑", "离"], 雷火丰: ["震", "离"], 地火明夷: ["坤", "离"], 地水师: ["坤", "坎"],
  艮为山: ["艮", "艮"], 山火贲: ["艮", "离"], 山天大畜: ["艮", "乾"], 山泽损: ["艮", "兑"],
  火泽睽: ["离", "兑"], 天泽履: ["乾", "兑"], 风泽中孚: ["巽", "兑"], 风山渐: ["巽", "艮"],
  震为雷: ["震", "震"], 雷地豫: ["震", "坤"], 雷水解: ["震", "坎"], 雷风恒: ["震", "巽"],
  地风升: ["坤", "巽"], 水风井: ["坎", "巽"], 泽风大过: ["兑", "巽"], 泽雷随: ["兑", "震"],
  巽为风: ["巽", "巽"], 风天小畜: ["巽", "乾"], 风火家人: ["巽", "离"], 风雷益: ["巽", "震"],
  天雷无妄: ["乾", "震"], 火雷噬嗑: ["离", "震"], 山雷颐: ["艮", "震"], 山风蛊: ["艮", "巽"],
  离为火: ["离", "离"], 火山旅: ["离", "艮"], 火风鼎: ["离", "巽"], 火水未济: ["离", "坎"],
  山水蒙: ["艮", "坎"], 风水涣: ["巽", "坎"], 天水讼: ["乾", "坎"], 天火同人: ["乾", "离"],
  坤为地: ["坤", "坤"], 地雷复: ["坤", "震"], 地泽临: ["坤", "兑"], 地天泰: ["坤", "乾"],
  雷天大壮: ["震", "乾"], 泽天夬: ["兑", "乾"], 水天需: ["坎", "乾"], 水地比: ["坎", "坤"],
  兑为泽: ["兑", "兑"], 泽水困: ["兑", "坎"], 泽地萃: ["兑", "坤"], 泽山咸: ["兑", "艮"],
  水山蹇: ["坎", "艮"], 地山谦: ["坤", "艮"], 雷山小过: ["震", "艮"], 雷泽归妹: ["震", "兑"],
};

// §4.3 — six gods cycle ascending from a god fixed by the day stem.
const SIX_GODS_CYCLE: readonly SixGod[] = ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"];
const DAY_STEM_START: Record<Stem, SixGod> = {
  甲: "青龙", 乙: "青龙", 丙: "朱雀", 丁: "朱雀", 戊: "勾陈",
  己: "螣蛇", 庚: "白虎", 辛: "白虎", 壬: "玄武", 癸: "玄武",
};

export type ChartLine = {
  position: number; // 1 = 初爻 (bottom) … 6 = 上爻 (top)
  stem: Stem;
  branch: Branch;
  ganzhi: string; // stem + branch, e.g. "甲子"
  directionDeg: number; // 0–330, sector centre
  direction: string; // N / NNE / … (12-point)
  branchElement: Element;
  isWorld: boolean; // 世爻
  isResponse: boolean; // 应爻
  sixGod: SixGod | null; // null when no day stem supplied
};

export type DaguaChart = {
  hexagram: string;
  upperTrigram: Trigram;
  lowerTrigram: Trigram;
  palace: Palace;
  palaceElement: Element;
  transformation: Transformation;
  worldLine: number;
  responseLine: number;
  yuanshen: string; // 元神 — stem + branch
  dayStem: Stem | null;
  lines: ChartLine[]; // lines[0] = line 1 (bottom) … lines[5] = line 6 (top)
};

export function palaceOf(hexagram: string): { palace: Palace; index: number } {
  for (const palace of Object.keys(PALACE_ORDER) as Palace[]) {
    const i = PALACE_ORDER[palace].indexOf(hexagram);
    if (i !== -1) return { palace, index: i };
  }
  throw new Error(`Unknown hexagram: ${hexagram}`);
}

export function worldResponse(hexagram: string): { world: number; response: number } {
  const { index } = palaceOf(hexagram);
  const world = WORLD_LINE_BY_INDEX[index];
  const response = ((world - 1 + 3) % 6) + 1;
  return { world, response };
}

type RawLine = { position: number; stem: Stem; branch: Branch };

export function najiaLines(hexagram: string): RawLine[] {
  const pair = HEXAGRAM_TRIGRAMS[hexagram];
  if (!pair) throw new Error(`Unknown hexagram: ${hexagram}`);
  const [upper, lower] = pair;
  const lo = TRIGRAMS[lower];
  const up = TRIGRAMS[upper];
  const lines: RawLine[] = [];
  for (let i = 0; i < 3; i++) {
    // lines 1–3 = lower (inner) trigram
    lines.push({ position: i + 1, stem: lo.stemLower, branch: lo.brLower[i] });
  }
  for (let i = 0; i < 3; i++) {
    // lines 4–6 = upper (outer) trigram
    lines.push({ position: i + 4, stem: up.stemUpper, branch: up.brUpper[i] });
  }
  return lines;
}

export function sixGods(dayStem: Stem): SixGod[] {
  const start = SIX_GODS_CYCLE.indexOf(DAY_STEM_START[dayStem]);
  return Array.from({ length: 6 }, (_, i) => SIX_GODS_CYCLE[(start + i) % 6]);
}

// §3.3 — the 元神 is the palace's pure-trigram hexagram's najia at the world-line
// position (the line "hidden" behind the transformed hexagram's world line).
export function yuanshen(hexagram: string): string {
  const { palace } = palaceOf(hexagram);
  const pure = PALACE_ORDER[palace][0];
  const { world } = worldResponse(hexagram);
  const line = najiaLines(pure)[world - 1];
  return line.stem + line.branch;
}

export function buildChart(hexagram: string, dayStem: Stem | null = null): DaguaChart {
  const pair = HEXAGRAM_TRIGRAMS[hexagram];
  if (!pair) throw new Error(`Unknown hexagram: ${hexagram}`);
  const [upperTrigram, lowerTrigram] = pair;
  const { palace, index } = palaceOf(hexagram);
  const { world, response } = worldResponse(hexagram);
  const raw = najiaLines(hexagram);
  const gods = dayStem ? sixGods(dayStem) : (Array(6).fill(null) as null[]);

  const lines: ChartLine[] = raw.map((line, i) => {
    const deg = BRANCH_DIR[line.branch];
    return {
      position: line.position,
      stem: line.stem,
      branch: line.branch,
      ganzhi: line.stem + line.branch,
      directionDeg: deg,
      direction: DIR_LABEL[deg],
      branchElement: BRANCH_ELEMENT[line.branch],
      isWorld: line.position === world,
      isResponse: line.position === response,
      sixGod: gods[i],
    };
  });

  return {
    hexagram,
    upperTrigram,
    lowerTrigram,
    palace,
    palaceElement: TRIGRAMS[palace].element,
    transformation: TRANSFORMATION[index],
    worldLine: world,
    responseLine: response,
    yuanshen: yuanshen(hexagram),
    dayStem,
    lines,
  };
}

/** All 64 canonical hexagram names (full form, as used by buildChart). */
export function allHexagrams(): string[] {
  return Object.values(PALACE_ORDER).flat();
}

// ---------------------------------------------------------------------------
// 卦運 / index code.
//
// 先天体后天用 (XT_LS): a trigram's number is the 后天 (Lo Shu) number of the
// compass position it occupies in the 先天 arrangement.
//
// index code (verified 64/64 against table B): idxTop = XT_LS[upper]·10 + XT_LS[lower].
//
// 卦運 is generated by 归藏 (the practitioner's lineage rule, confirmed 2026-06):
// compare the two trigrams line-by-line — 同爻為陰(0)、異爻為陽(1), i.e. a bitwise
// XOR — to get a resulting trigram, and take ITS XT_LS number. 合十 is NOT the
// generator; it is only a relationship / 成局 / cross-check between hexagrams.
//   e.g. 地山谦 = 坤(000) ⊕ 艮(001) = 艮(001) → XT_LS[艮] = 6.
// (The earlier 10 − XT_LS[upper] inference — which wrongly gave 谦 = 9 — is removed.
// It happened to match the source image's 卦運 column, which follows a different
// convention; see dagua-source.ts.)
// ---------------------------------------------------------------------------
const XT_LS: Record<Trigram, number> = {
  乾: 9, 兑: 4, 离: 3, 震: 8, 巽: 2, 坎: 7, 艮: 6, 坤: 1,
};

// Reverse map: a trigram's three lines (as a "bbb" string) → the trigram.
const TRIGRAM_BY_LINES = Object.fromEntries(
  (Object.keys(TRIGRAMS) as Trigram[]).map((t) => [TRIGRAMS[t].lines.join(""), t]),
) as Record<string, Trigram>;

// 归藏: the trigram whose lines are the XOR (同陰異陽) of two trigrams' lines.
function guiCang(upper: Trigram, lower: Trigram): Trigram {
  const u = TRIGRAMS[upper].lines;
  const l = TRIGRAMS[lower].lines;
  return TRIGRAM_BY_LINES[`${u[0] ^ l[0]}${u[1] ^ l[1]}${u[2] ^ l[2]}`];
}

/**
 * 卦運 (period number, 1-9 and never 5) via 归藏: XT_LS of (upper ⊕ lower).
 * Deterministic for all 64; the practitioner's lineage rule.
 */
export function guaYun(hexagram: string): number {
  const pair = HEXAGRAM_TRIGRAMS[hexagram];
  if (!pair) throw new Error(`Unknown hexagram: ${hexagram}`);
  return XT_LS[guiCang(pair[0], pair[1])]; // pair[0]=upper, pair[1]=lower
}

/** The luopan index code (先天体后天用 coordinate): XT_LS[upper]·10 + XT_LS[lower]. */
export function indexCode(hexagram: string): number {
  const pair = HEXAGRAM_TRIGRAMS[hexagram];
  if (!pair) throw new Error(`Unknown hexagram: ${hexagram}`);
  return XT_LS[pair[0]] * 10 + XT_LS[pair[1]];
}
