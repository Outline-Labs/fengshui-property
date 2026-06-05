import { describe, expect, it } from "vitest";

import { computeUnitReading } from "./unit-reading";

// ---------------------------------------------------------------------------
// The unit reading is the deterministic engine: same (facing, year, rooms) →
// same score & factors, every time. Verdicts come from 八宅 + 玄空飞星, not an LLM.
// facing S = 坎宅 (东四宅): 吉 = SE生气 / E天医 / S延年 / N伏位; 凶 = SW绝命 / W五鬼 /
// NW六煞 / NE祸害.
// ---------------------------------------------------------------------------
describe("computeUnitReading — determinism & range", () => {
  it("is fully reproducible for the same inputs", () => {
    const rooms = [
      { name: "Kitchen", sector: "SE" },
      { name: "Master Bedroom", sector: "S" },
      { name: "Bathroom", sector: "SW" },
    ];
    const a = computeUnitReading("S", 2024, rooms);
    const b = computeUnitReading("S", 2024, rooms);
    expect(a.score).toBe(b.score);
    expect(a.factors).toEqual(b.factors);
  });

  it("keeps the score within 0–10 and exposes all 8 sectors", () => {
    const r = computeUnitReading("N", undefined, [{ name: "Living", sector: "E" }]);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(10);
    expect(Object.keys(r.sectors)).toHaveLength(8);
  });
});

describe("computeUnitReading — placement verdicts (坎宅, facing S)", () => {
  it("rewards a kitchen on an auspicious sector and penalises an inauspicious one", () => {
    const good = computeUnitReading("S", 2024, [{ name: "Kitchen", sector: "SE" }]); // 生气
    const bad = computeUnitReading("S", 2024, [{ name: "Kitchen", sector: "SW" }]); // 绝命
    expect(good.score).toBeGreaterThan(5);
    expect(bad.score).toBeLessThan(5);
    expect(good.factors[0].type).toBe("positive");
    expect(bad.factors[0].type).toBe("negative");
  });

  it("inverts the rule for a bathroom — a 凶 sector is the favourable spot", () => {
    const wcBad = computeUnitReading("S", 2024, [{ name: "Bathroom", sector: "SE" }]); // 吉 → wasted
    const wcGood = computeUnitReading("S", 2024, [{ name: "Bathroom", sector: "SW" }]); // 凶 → presses 煞
    expect(wcGood.factors[0].type).toBe("positive");
    expect(wcBad.factors[0].type).toBe("negative");
    expect(wcGood.score).toBeGreaterThan(wcBad.score);
  });

  it("scores an all-auspicious layout above an all-inauspicious one", () => {
    const rooms = (sectors: string[]) =>
      sectors.map((s, i) => ({ name: `Bedroom ${i}`, sector: s }));
    const auspicious = computeUnitReading("S", 2024, rooms(["SE", "E", "S"]));
    const inauspicious = computeUnitReading("S", 2024, rooms(["SW", "W", "NW"]));
    expect(auspicious.score).toBeGreaterThan(inauspicious.score);
    expect(auspicious.score).toBeGreaterThan(6);
    expect(inauspicious.score).toBeLessThan(4);
  });

  it("skips rooms whose sector isn't one of the 8 directions", () => {
    const r = computeUnitReading("S", 2024, [
      { name: "Store", sector: "center" },
      { name: "Closet", sector: "—" },
    ]);
    expect(r.factors).toHaveLength(0);
    expect(r.score).toBe(5); // no placeable rooms → neutral
  });
});
