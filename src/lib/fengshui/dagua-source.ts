// GENERATED from the master's source charts (A: 64-gua luopan ring; B: the
// 24-mountain → hexagram + index table). Reconstructed and cross-validated:
//   - A's 64-slice ring order × B's hexagram placement agree on all 64
//   - opposite slices are 错卦 (binary complements): 0/32 failures
//   - anchors: slice 0 = 地雷复 (0°), slice 27 = 风天小畜 (≈153°), slice 59 =
//     雷地豫, slice 63 = 坤为地; worked example heading 155° → 小畜 ✓
// The ring is the 先天六十四卦圆图 (Fu Xi circular), 復 at true north, clockwise,
// each hexagram a 5.625° slice. DO NOT hand-edit — regenerate from source.

/** Hexagram per 5.625° slice, slice 0 starting at 0° (true north), clockwise. */
export const RING: readonly string[] = [
  "地雷复",
  "山雷颐",
  "水雷屯",
  "风雷益", // slice 0-3
  "震为雷",
  "火雷噬嗑",
  "泽雷随",
  "天雷无妄", // slice 4-7
  "地火明夷",
  "山火贲",
  "水火既济",
  "风火家人", // slice 8-11
  "雷火丰",
  "离为火",
  "泽火革",
  "天火同人", // slice 12-15
  "地泽临",
  "山泽损",
  "水泽节",
  "风泽中孚", // slice 16-19
  "雷泽归妹",
  "火泽睽",
  "兑为泽",
  "天泽履", // slice 20-23
  "地天泰",
  "山天大畜",
  "水天需",
  "风天小畜", // slice 24-27
  "雷天大壮",
  "火天大有",
  "泽天夬",
  "乾为天", // slice 28-31
  "天风姤",
  "泽风大过",
  "火风鼎",
  "雷风恒", // slice 32-35
  "巽为风",
  "水风井",
  "山风蛊",
  "地风升", // slice 36-39
  "天水讼",
  "泽水困",
  "火水未济",
  "雷水解", // slice 40-43
  "风水涣",
  "坎为水",
  "山水蒙",
  "地水师", // slice 44-47
  "天山遁",
  "泽山咸",
  "火山旅",
  "雷山小过", // slice 48-51
  "风山渐",
  "水山蹇",
  "艮为山",
  "地山谦", // slice 52-55
  "天地否",
  "泽地萃",
  "火地晋",
  "雷地豫", // slice 56-59
  "风地观",
  "水地比",
  "山地剥",
  "坤为地", // slice 60-63
];

export type HexSourceMeta = {
  /** The paired index numbers printed beside the hexagram on the luopan (table
   *  B). Meaning not yet decoded — each is two digits 1-9. Carried verbatim. */
  indexTop: number;
  indexBottom: number;
  /** 卦運 (period number 1-9) — the input the (gated) 旺/衰 rule needs. */
  guaYun: number;
};

/**
 * Per-hexagram source metadata transcribed from table B.
 *
 * ⚠️ guaYun is ~94% verified: the 合十 law (错卦 pairs sum to 10) flags two
 * pairs as misread — 火泽睽/水山蹇 (read 7+7) and 天泽履/地山谦 (read 1+6) — so
 * four guaYun values are UNTRUSTWORTHY. Do not drive 旺/衰 off guaYun until a
 * cleaner read or the practitioner confirms the values. indexTop/indexBottom
 * meaning is still undecoded.
 */
export const HEX_SOURCE: Readonly<Record<string, HexSourceMeta>> = {
  "风天小畜": { indexTop: 29, indexBottom: 84, guaYun: 8 },
  "水天需": { indexTop: 79, indexBottom: 32, guaYun: 3 },
  "山天大畜": { indexTop: 69, indexBottom: 48, guaYun: 4 },
  "地天泰": { indexTop: 19, indexBottom: 92, guaYun: 9 },
  "天泽履": { indexTop: 94, indexBottom: 68, guaYun: 1 },
  "兑为泽": { indexTop: 44, indexBottom: 17, guaYun: 6 },
  "火泽睽": { indexTop: 34, indexBottom: 28, guaYun: 7 },
  "雷泽归妹": { indexTop: 84, indexBottom: 77, guaYun: 2 },
  "风泽中孚": { indexTop: 24, indexBottom: 38, guaYun: 8 },
  "水泽节": { indexTop: 74, indexBottom: 81, guaYun: 3 },
  "山泽损": { indexTop: 64, indexBottom: 98, guaYun: 4 },
  "地泽临": { indexTop: 14, indexBottom: 42, guaYun: 9 },
  "天火同人": { indexTop: 93, indexBottom: 79, guaYun: 1 },
  "泽火革": { indexTop: 43, indexBottom: 21, guaYun: 6 },
  "离为火": { indexTop: 33, indexBottom: 19, guaYun: 7 },
  "雷火丰": { indexTop: 83, indexBottom: 61, guaYun: 2 },
  "风火家人": { indexTop: 23, indexBottom: 44, guaYun: 8 },
  "水火既济": { indexTop: 73, indexBottom: 91, guaYun: 3 },
  "山火贲": { indexTop: 63, indexBottom: 88, guaYun: 4 },
  "地火明夷": { indexTop: 13, indexBottom: 31, guaYun: 9 },
  "天雷无妄": { indexTop: 98, indexBottom: 24, guaYun: 1 },
  "泽雷随": { indexTop: 48, indexBottom: 73, guaYun: 6 },
  "火雷噬嗑": { indexTop: 38, indexBottom: 64, guaYun: 7 },
  "震为雷": { indexTop: 88, indexBottom: 13, guaYun: 2 },
  "风雷益": { indexTop: 28, indexBottom: 94, guaYun: 8 },
  "水雷屯": { indexTop: 78, indexBottom: 41, guaYun: 3 },
  "山雷颐": { indexTop: 68, indexBottom: 34, guaYun: 4 },
  "地雷复": { indexTop: 18, indexBottom: 82, guaYun: 9 },
  "坤为地": { indexTop: 11, indexBottom: 12, guaYun: 9 },
  "山地剥": { indexTop: 61, indexBottom: 66, guaYun: 4 },
  "水地比": { indexTop: 71, indexBottom: 72, guaYun: 3 },
  "风地观": { indexTop: 21, indexBottom: 26, guaYun: 8 },
  "雷地豫": { indexTop: 81, indexBottom: 83, guaYun: 2 },
  "火地晋": { indexTop: 31, indexBottom: 36, guaYun: 7 },
  "泽地萃": { indexTop: 41, indexBottom: 47, guaYun: 6 },
  "天地否": { indexTop: 91, indexBottom: 96, guaYun: 1 },
  "地山谦": { indexTop: 16, indexBottom: 67, guaYun: 6 },
  "艮为山": { indexTop: 66, indexBottom: 18, guaYun: 4 },
  "水山蹇": { indexTop: 76, indexBottom: 27, guaYun: 7 },
  "风山渐": { indexTop: 26, indexBottom: 78, guaYun: 8 },
  "雷山小过": { indexTop: 86, indexBottom: 37, guaYun: 2 },
  "火山旅": { indexTop: 36, indexBottom: 89, guaYun: 7 },
  "泽山咸": { indexTop: 46, indexBottom: 97, guaYun: 6 },
  "天山遁": { indexTop: 96, indexBottom: 46, guaYun: 1 },
  "地水师": { indexTop: 17, indexBottom: 71, guaYun: 9 },
  "山水蒙": { indexTop: 67, indexBottom: 29, guaYun: 4 },
  "坎为水": { indexTop: 77, indexBottom: 11, guaYun: 3 },
  "风水涣": { indexTop: 27, indexBottom: 69, guaYun: 8 },
  "雷水解": { indexTop: 87, indexBottom: 43, guaYun: 2 },
  "火水未济": { indexTop: 37, indexBottom: 99, guaYun: 7 },
  "泽水困": { indexTop: 47, indexBottom: 87, guaYun: 6 },
  "天水讼": { indexTop: 97, indexBottom: 39, guaYun: 1 },
  "地风升": { indexTop: 12, indexBottom: 23, guaYun: 9 },
  "山风蛊": { indexTop: 62, indexBottom: 74, guaYun: 4 },
  "水风井": { indexTop: 72, indexBottom: 63, guaYun: 3 },
  "巽为风": { indexTop: 22, indexBottom: 14, guaYun: 8 },
  "雷风恒": { indexTop: 82, indexBottom: 93, guaYun: 2 },
  "火风鼎": { indexTop: 32, indexBottom: 49, guaYun: 7 },
  "泽风大过": { indexTop: 42, indexBottom: 33, guaYun: 6 },
  "天风姤": { indexTop: 92, indexBottom: 86, guaYun: 1 },
  "乾为天": { indexTop: 99, indexBottom: 16, guaYun: 1 },
  "泽天夬": { indexTop: 49, indexBottom: 62, guaYun: 6 },
  "火天大有": { indexTop: 39, indexBottom: 76, guaYun: 7 },
  "雷天大壮": { indexTop: 89, indexBottom: 22, guaYun: 2 },
};

/** Hexagrams whose transcribed 卦運 failed the 合十 cross-check (suspect). */
export const SUSPECT_GUAYUN: readonly string[] = ["火泽睽","水山蹇","天泽履","地山谦"];
