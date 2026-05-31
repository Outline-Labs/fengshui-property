import { describe, expect, it } from "vitest";

import {
  type Dir8,
  type FlyingStarChart,
  type Palace,
  computeFlyingStars,
  periodFromYear,
} from "./flying-stars";

// ---------------------------------------------------------------------------
// These expectations are derived BY HAND from the canonical Xuan Kong 下卦
// (Sceptre/natal chart) rules — NOT read back from the implementation. If the
// code diverges from a value here, the code is wrong, not the test.
//
// Method recap (period 9, 2024–2043):
//  1. Period star flies forward from the centre along the Lo Shu path
//     C → NW → W → NE → S → N → SW → E → SE.
//  2. The period number in the FACING palace becomes the facing (向) star in
//     the centre; the number in the SITTING palace becomes the mountain (山)
//     star in the centre.
//  3. Each of those flies forward if its governing 天元 (middle) mountain is
//     yang, reverse if yin. Cardinals 子卯午酉 (homes N/E/S/W) are yin →
//     reverse; diagonals 艮巽坤乾 (homes NE/SE/SW/NW) are yang → forward.
// ---------------------------------------------------------------------------

type Layer = "base" | "mountain" | "facing";

/** Pull one star layer out of a chart as a palace→digit map for assertions. */
function layer(chart: FlyingStarChart, which: Layer): Record<Palace, number> {
  const out = {} as Record<Palace, number>;
  for (const c of chart.cells) out[c.palace] = c[which];
  return out;
}

const P9 = 2024; // any year in 2024–2043 is period 9

describe("periodFromYear", () => {
  it("defaults to the current period (9) without/with bad input", () => {
    expect(periodFromYear()).toBe(9);
    expect(periodFromYear(Number.NaN)).toBe(9);
    expect(periodFromYear(undefined)).toBe(9);
  });

  it("maps years to their 20-year period", () => {
    expect(periodFromYear(1864)).toBe(1); // start of cycle
    expect(periodFromYear(1984)).toBe(7); // 1984–2003
    expect(periodFromYear(2003)).toBe(7);
    expect(periodFromYear(2004)).toBe(8); // 2004–2023
    expect(periodFromYear(2023)).toBe(8);
    expect(periodFromYear(2024)).toBe(9); // 2024–2043
    expect(periodFromYear(2043)).toBe(9);
  });

  it("clamps out-of-range years into [1, 9]", () => {
    expect(periodFromYear(1700)).toBe(1);
    expect(periodFromYear(2200)).toBe(9);
  });
});

describe("computeFlyingStars — centre cell composition", () => {
  // Centre = 山[sitting period-num] / 运[period] / 向[facing period-num].
  // Period-9 base chart: C9 NW1 W2 NE3 S4 N5 SW6 E7 SE8.
  const cases: Array<[Dir8, { mountain: number; base: number; facing: number }]> =
    [
      ["S", { mountain: 5, base: 9, facing: 4 }], // sitting N(5) / facing S(4)
      ["E", { mountain: 2, base: 9, facing: 7 }], // sitting W(2) / facing E(7)
      ["SW", { mountain: 3, base: 9, facing: 6 }], // sitting NE(3) / facing SW(6)
      ["N", { mountain: 4, base: 9, facing: 5 }], // sitting S(4) / facing N(5)
    ];

  it.each(cases)("facing %s has the expected centre", (facing, expected) => {
    const c = computeFlyingStars(facing, P9).cells.find((x) => x.palace === "C")!;
    expect({ mountain: c.mountain, base: c.base, facing: c.facing }).toEqual(
      expected,
    );
  });
});

describe("computeFlyingStars — full golden charts (no 5 in centre)", () => {
  it("period 9, facing E (向7 reverse, 山2 forward)", () => {
    const chart = computeFlyingStars("E", P9);
    expect(chart.sitting).toBe("W");

    expect(layer(chart, "base")).toEqual({
      C: 9, NW: 1, W: 2, NE: 3, S: 4, N: 5, SW: 6, E: 7, SE: 8,
    });
    expect(layer(chart, "facing")).toEqual({
      C: 7, NW: 6, W: 5, NE: 4, S: 3, N: 2, SW: 1, E: 9, SE: 8,
    });
    expect(layer(chart, "mountain")).toEqual({
      C: 2, NW: 3, W: 4, NE: 5, S: 6, N: 7, SW: 8, E: 9, SE: 1,
    });
  });

  it("period 9, facing SW (向6 forward, 山3 reverse)", () => {
    const chart = computeFlyingStars("SW", P9);
    expect(chart.sitting).toBe("NE");

    expect(layer(chart, "facing")).toEqual({
      C: 6, NW: 7, W: 8, NE: 9, S: 1, N: 2, SW: 3, E: 4, SE: 5,
    });
    expect(layer(chart, "mountain")).toEqual({
      C: 3, NW: 2, W: 1, NE: 9, S: 8, N: 7, SW: 6, E: 5, SE: 4,
    });
  });
});

describe("computeFlyingStars — 5-yellow in centre (CONVENTION — confirm w/ master)", () => {
  // ⚠️ When a 5 (no home trigram) lands in the centre, schools disagree on its
  // polarity. The implementation's documented convention: 5 borrows the 天元
  // polarity of the palace it occupies (here the facing/sitting direction).
  // This test pins THAT convention so it can't change silently — but the rule
  // itself should be confirmed by a fengshui master before launch.
  it("period 9, facing N → facing star 5 flies reverse (borrows N = yin)", () => {
    const chart = computeFlyingStars("N", P9);
    expect(chart.sitting).toBe("S");
    // 向5 reverse from centre:
    expect(layer(chart, "facing")).toEqual({
      C: 5, NW: 4, W: 3, NE: 2, S: 1, N: 9, SW: 8, E: 7, SE: 6,
    });
    // 山4 forward (4 home SE = yang):
    expect(layer(chart, "mountain")).toEqual({
      C: 4, NW: 5, W: 6, NE: 7, S: 8, N: 9, SW: 1, E: 2, SE: 3,
    });
  });
});

describe("computeFlyingStars — structural invariants (all facings)", () => {
  const dirs: Dir8[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const perm = (m: Record<Palace, number>) =>
    [...Object.values(m)].sort((a, b) => a - b);

  it.each(dirs)("facing %s: each layer is a permutation of 1..9", (facing) => {
    const chart = computeFlyingStars(facing, P9);
    expect(chart.cells).toHaveLength(9);
    for (const which of ["base", "mountain", "facing"] as const) {
      expect(perm(layer(chart, which))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it.each(dirs)("facing %s: centre base equals the period", (facing) => {
    const chart = computeFlyingStars(facing, P9);
    const centre = chart.cells.find((c) => c.palace === "C")!;
    expect(centre.base).toBe(chart.period);
    expect(chart.sitting).not.toBe(facing);
  });
});
