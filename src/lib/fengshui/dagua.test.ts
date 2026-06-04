import { describe, expect, it } from "vitest";

import {
  type ChartLine,
  type SixGod,
  allHexagrams,
  buildChart,
  guaYun,
  indexCode,
  najiaLines,
  palaceOf,
  sixGods,
  worldResponse,
  yuanshen,
} from "./dagua";

// Compact view of a line for assertions: position, ganzhi, world/response,
// six god, direction label + degrees, branch element.
function row(l: ChartLine) {
  return {
    pos: l.position,
    ganzhi: l.ganzhi,
    world: l.isWorld,
    response: l.isResponse,
    god: l.sixGod,
    dir: l.direction,
    deg: l.directionDeg,
    el: l.branchElement,
  };
}

// ---------------------------------------------------------------------------
// §7 GOLDEN TEST — 41 Queen's Close (风天小畜, 巳 sitting, day stem 丙).
// This handwritten chart + the §3.4 footnote are the two ground truths the
// whole Layer-B engine was derived against. If this reproduces exactly, the
// najia / 世应 / 元神 / six-god / direction constants are correct.
// ---------------------------------------------------------------------------
describe("buildChart — §7 golden test (风天小畜)", () => {
  const c = buildChart("风天小畜", "丙");

  it("reproduces the hexagram-level fields", () => {
    expect(c.palace).toBe("巽");
    expect(c.transformation).toBe("一世");
    expect(c.worldLine).toBe(1);
    expect(c.responseLine).toBe(4);
    expect(c.yuanshen).toBe("辛丑");
    expect(c.upperTrigram).toBe("巽");
    expect(c.lowerTrigram).toBe("乾");
    expect(c.palaceElement).toBe("木"); // 巽 = 木
    expect(c.dayStem).toBe("丙");
  });

  it("reproduces all six lines line-for-line (bottom→top)", () => {
    expect(c.lines.map(row)).toEqual([
      { pos: 1, ganzhi: "甲子", world: true, response: false, god: "朱雀", dir: "N", deg: 0, el: "水" },
      { pos: 2, ganzhi: "甲寅", world: false, response: false, god: "勾陈", dir: "ENE", deg: 60, el: "木" },
      { pos: 3, ganzhi: "甲辰", world: false, response: false, god: "螣蛇", dir: "ESE", deg: 120, el: "土" },
      { pos: 4, ganzhi: "辛未", world: false, response: true, god: "白虎", dir: "SSW", deg: 210, el: "土" },
      { pos: 5, ganzhi: "辛巳", world: false, response: false, god: "玄武", dir: "SSE", deg: 150, el: "火" },
      { pos: 6, ganzhi: "辛卯", world: false, response: false, god: "青龙", dir: "E", deg: 90, el: "木" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// §3.4 — the 元神 footnote examples (the second ground truth).
// ---------------------------------------------------------------------------
describe("yuanshen — §3.4 footnote examples", () => {
  it("乾为天 元神 = 壬戌 (world line 6)", () => {
    expect(worldResponse("乾为天").world).toBe(6);
    expect(yuanshen("乾为天")).toBe("壬戌");
  });

  it("天地否 元神 = 甲辰 (world line 3 — the hidden 乾为天 line 3)", () => {
    expect(worldResponse("天地否").world).toBe(3);
    expect(yuanshen("天地否")).toBe("甲辰");
  });
});

// ---------------------------------------------------------------------------
// najia generation — §4.1 trigram source of truth.
// ---------------------------------------------------------------------------
describe("najiaLines", () => {
  it("乾为天: 甲子 甲寅 甲辰 (inner 甲) / 壬午 壬申 壬戌 (outer 壬)", () => {
    expect(najiaLines("乾为天").map((l) => l.stem + l.branch)).toEqual([
      "甲子", "甲寅", "甲辰", "壬午", "壬申", "壬戌",
    ]);
  });

  it("坤为地: inner 乙 (未巳卯) / outer 癸 (丑亥酉) — the other split-stem trigram", () => {
    expect(najiaLines("坤为地").map((l) => l.stem + l.branch)).toEqual([
      "乙未", "乙巳", "乙卯", "癸丑", "癸亥", "癸酉",
    ]);
  });
});

// ---------------------------------------------------------------------------
// world / response — §4.2.
// ---------------------------------------------------------------------------
describe("worldResponse", () => {
  it("本宫 (乾为天): world 6, response 3", () => {
    expect(worldResponse("乾为天")).toEqual({ world: 6, response: 3 });
  });
  it("一世 (风天小畜): world 1, response 4", () => {
    expect(worldResponse("风天小畜")).toEqual({ world: 1, response: 4 });
  });
  it("游魂 (火地晋, index 6): world 4, response 1", () => {
    expect(worldResponse("火地晋")).toEqual({ world: 4, response: 1 });
  });
});

// ---------------------------------------------------------------------------
// six gods — §4.3.
// ---------------------------------------------------------------------------
describe("sixGods", () => {
  it("丙 day starts on 朱雀 and cycles up (line1→line6)", () => {
    expect(sixGods("丙")).toEqual(["朱雀", "勾陈", "螣蛇", "白虎", "玄武", "青龙"]);
  });
  it("甲 day starts on 青龙", () => {
    expect(sixGods("甲")).toEqual(["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"]);
  });
  it("壬 day starts on 玄武 (wraps the cycle)", () => {
    expect(sixGods("壬")).toEqual(["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"]);
  });
  it("no day stem → every line's six god is null", () => {
    const c = buildChart("风天小畜");
    expect(c.dayStem).toBeNull();
    expect(c.lines.every((l) => l.sixGod === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §3.4 — all 64 hexagrams resolve with structurally valid charts.
// ---------------------------------------------------------------------------
describe("all 64 hexagrams", () => {
  const hexes = allHexagrams();
  const DIRS = new Set(["N", "NNE", "ENE", "E", "ESE", "SSE", "S", "SSW", "WSW", "W", "WNW", "NNW"]);
  const ELS = new Set(["金", "木", "水", "火", "土"]);
  const GODS = new Set<SixGod>(["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"]);

  it("enumerates exactly 64 distinct hexagrams", () => {
    expect(hexes).toHaveLength(64);
    expect(new Set(hexes).size).toBe(64);
  });

  it("every hexagram builds a valid 6-line chart (with a day stem)", () => {
    for (const h of hexes) {
      const c = buildChart(h, "甲");
      expect(c.lines).toHaveLength(6);
      expect(c.lines.map((l) => l.position)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(c.worldLine).toBeGreaterThanOrEqual(1);
      expect(c.worldLine).toBeLessThanOrEqual(6);
      // Exactly one world line and exactly one response line.
      expect(c.lines.filter((l) => l.isWorld)).toHaveLength(1);
      expect(c.lines.filter((l) => l.isResponse)).toHaveLength(1);
      // response = world ± 3, never equal to world.
      expect(c.responseLine).not.toBe(c.worldLine);
      expect(Math.abs(c.responseLine - c.worldLine)).toBe(3);
      for (const l of c.lines) {
        expect(DIRS.has(l.direction)).toBe(true);
        expect(l.directionDeg % 30).toBe(0);
        expect(ELS.has(l.branchElement)).toBe(true);
        expect(GODS.has(l.sixGod as SixGod)).toBe(true);
        expect(l.ganzhi).toBe(l.stem + l.branch);
      }
      // 元神 is a well-formed ganzhi.
      expect(c.yuanshen).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Errors — unknown hexagrams fail loudly (never a silent bogus chart).
// ---------------------------------------------------------------------------
describe("unknown hexagram", () => {
  it("buildChart throws", () => {
    expect(() => buildChart("小畜")).toThrow(/Unknown hexagram/); // short name not accepted
    expect(() => buildChart("乱码")).toThrow(/Unknown hexagram/);
  });
  it("palaceOf throws", () => {
    expect(() => palaceOf("nope")).toThrow(/Unknown hexagram/);
  });
});

// ---------------------------------------------------------------------------
// 卦運 / index code (INFERRED rule, decoded from the luopan). The rule must
// satisfy two classical invariants over all 64, which is how we trust it.
// ---------------------------------------------------------------------------
describe("guaYun / indexCode — decoded rule", () => {
  it("matches the anchors (and the OCR-corrected values)", () => {
    expect(guaYun("风天小畜")).toBe(8);
    expect(indexCode("风天小畜")).toBe(29);
    expect(guaYun("雷地豫")).toBe(2);
    expect(indexCode("雷地豫")).toBe(81);
    // The two the 合十 law flagged as misread — the rule corrects them:
    expect(guaYun("地山谦")).toBe(9); // transcription read 6
    expect(guaYun("水山蹇")).toBe(3); // transcription read 7
  });

  it("every 卦運 is 1-9 and never 5", () => {
    for (const h of allHexagrams()) {
      const y = guaYun(h);
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(9);
      expect(y).not.toBe(5);
    }
  });

  it("錯卦 (binary complement) pairs sum to 10 — 合十", () => {
    const COMP: Record<string, string> = { 乾: "坤", 坤: "乾", 兑: "艮", 艮: "兑", 离: "坎", 坎: "离", 震: "巽", 巽: "震" };
    const NAT: Record<string, string> = { 天: "乾", 泽: "兑", 火: "离", 雷: "震", 风: "巽", 水: "坎", 山: "艮", 地: "坤" };
    const trig = (n: string): [string, string] =>
      n.includes("为") ? [n[0], n[0]] : [NAT[n[0]], NAT[n[1]]];
    const PURE: Record<string, string> = { 乾: "乾为天", 兑: "兑为泽", 离: "离为火", 震: "震为雷", 巽: "巽为风", 坎: "坎为水", 艮: "艮为山", 坤: "坤为地" };
    const NATofTRIG: Record<string, string> = { 乾: "天", 兑: "泽", 离: "火", 震: "雷", 巽: "风", 坎: "水", 艮: "山", 坤: "地" };
    const nameOf = (u: string, l: string) =>
      u === l ? PURE[u] : NATofTRIG[u] + NATofTRIG[l] + "?"; // only need the canon for lookup below
    for (const h of allHexagrams()) {
      const [u, l] = trig(h);
      const compName = u === l ? PURE[COMP[u]] : allHexagrams().find((x) => {
        const [xu, xl] = trig(x);
        return xu === COMP[u] && xl === COMP[l];
      });
      expect(compName, `complement of ${h}`).toBeDefined();
      expect(guaYun(h) + guaYun(compName!)).toBe(10);
    }
    void nameOf;
  });

  it("each 卦運 value (1,2,3,4,6,7,8,9) appears exactly 8 times", () => {
    const counts: Record<number, number> = {};
    for (const h of allHexagrams()) counts[guaYun(h)] = (counts[guaYun(h)] ?? 0) + 1;
    for (const v of [1, 2, 3, 4, 6, 7, 8, 9]) expect(counts[v], `運${v}`).toBe(8);
  });
});
