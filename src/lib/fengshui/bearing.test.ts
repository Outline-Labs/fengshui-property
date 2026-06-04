import { describe, expect, it } from "vitest";

import { allHexagrams, buildChart } from "./dagua";
import { RING } from "./dagua-source";
import {
  SLICE_DEG,
  hexSource,
  hexagramForBearing,
  mountainForBearing,
  oppositeMountain,
  readingFromBearing,
  sittingFacingFromBearing,
} from "./bearing";

describe("mountainForBearing — 24-mountain bands (15° each, 子 on north)", () => {
  it("maps known bearings to the right mountain", () => {
    expect(mountainForBearing(0)).toBe("子");
    expect(mountainForBearing(90)).toBe("卯");
    expect(mountainForBearing(150)).toBe("巳");
    expect(mountainForBearing(330)).toBe("亥");
    expect(mountainForBearing(359)).toBe("子"); // wraps
    expect(mountainForBearing(-15)).toBe("壬");
  });
});

describe("oppositeMountain — sitting ↔ facing (180°)", () => {
  it("pairs opposites", () => {
    expect(oppositeMountain("巳")).toBe("亥");
    expect(oppositeMountain("子")).toBe("午");
  });
});

describe("hexagramForBearing — 5.625° slice lookup on the 先天圆图 ring", () => {
  it("hits the validated anchors", () => {
    expect(hexagramForBearing(0)).toBe("地雷复"); // slice 0 at true north
    expect(hexagramForBearing(359)).toBe("坤为地"); // slice 63
    expect(hexagramForBearing(335)).toBe("雷地豫"); // facing anchor
  });

  it("resolves the worked example's exact heading (slice precision within 巳)", () => {
    // Both lie in the 巳 mountain (142.5–157.5°), but different 5.625° slices.
    expect(hexagramForBearing(150)).toBe("水天需"); // slice 26
    expect(hexagramForBearing(155)).toBe("风天小畜"); // slice 27 — the master's reading
  });

  it("SLICE_DEG is 5.625°", () => {
    expect(SLICE_DEG).toBeCloseTo(5.625, 9);
  });
});

describe("sittingFacingFromBearing", () => {
  it("resolves the worked example (155° sitting 巳 → 小畜, facing 亥 → 豫)", () => {
    const r = sittingFacingFromBearing(155);
    expect(r.sittingMountain).toBe("巳");
    expect(r.facingMountain).toBe("亥");
    expect(r.sittingHexagram).toBe("风天小畜");
    expect(r.facingHexagram).toBe("雷地豫");
  });

  it("facing is always the 180° opposite slice, for every slice", () => {
    for (let k = 0; k < 64; k++) {
      const deg = k * SLICE_DEG + 1; // mid-ish of slice k
      const r = sittingFacingFromBearing(deg);
      expect(r.sittingHexagram).toBe(RING[k]);
      expect(r.facingHexagram).toBe(RING[(k + 32) % 64]);
    }
  });
});

describe("readingFromBearing — Layer A → Layer B end to end", () => {
  it("flows the worked example bearing into the verified Da Gua chart", () => {
    const r = readingFromBearing(155, "丙");
    expect(r.chart.hexagram).toBe("风天小畜");
    expect(r.chart.worldLine).toBe(1);
    expect(r.chart.yuanshen).toBe("辛丑");
    expect(r.facingChart.hexagram).toBe("雷地豫");
  });

  it("resolves a chart for every bearing (the ring is complete)", () => {
    for (let deg = 0; deg < 360; deg += 7) {
      expect(() => readingFromBearing(deg)).not.toThrow();
    }
  });
});

describe("RING integrity (vs the dagua engine)", () => {
  it("is exactly the 64 canonical hexagrams, once each", () => {
    expect(RING).toHaveLength(64);
    expect(new Set(RING).size).toBe(64);
    expect([...RING].sort()).toEqual([...allHexagrams()].sort());
  });

  it("every slice builds a valid Da Gua chart (names match the engine)", () => {
    for (const name of RING) {
      expect(() => buildChart(name)).not.toThrow();
    }
  });
});

describe("hexSource — transcribed luopan metadata", () => {
  it("returns the verified anchor's index pair + 卦運", () => {
    expect(hexSource("风天小畜")).toEqual({ indexTop: 29, indexBottom: 84, guaYun: 8 });
    expect(hexSource("雷地豫")).toEqual({ indexTop: 81, indexBottom: 83, guaYun: 2 });
  });
  it("returns null for an unknown name", () => {
    expect(hexSource("not a hexagram")).toBeNull();
  });
});
