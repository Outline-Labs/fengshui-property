import { describe, expect, it } from "vitest";

import { assessFlanks, computeUnitReading, flankOfSector } from "./unit-reading";

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

// ---------------------------------------------------------------------------
// 青龙白虎 (form-school flanks). Standing at the centre looking out the front
// (the facing): left of that axis = 青龙 (dragon, active), right = 白虎 (tiger,
// quiet). Classical 龙动虎静 — the dragon should out-rank the tiger in activity;
// fire (the stove) on the tiger is 白虎煞.
// ---------------------------------------------------------------------------
describe("青龙白虎 — form-school flanks (interior)", () => {
  it("splits sectors left/right of the facing axis (青龙 left, 白虎 right)", () => {
    // Facing N: west is on your left (青龙), east on your right (白虎).
    expect(flankOfSector("N", "W")).toBe("青龙");
    expect(flankOfSector("N", "E")).toBe("白虎");
    expect(flankOfSector("N", "N")).toBe("axis"); // dead ahead
    expect(flankOfSector("N", "S")).toBe("axis"); // directly behind
    // Facing S flips the sides.
    expect(flankOfSector("S", "E")).toBe("青龙");
    expect(flankOfSector("S", "W")).toBe("白虎");
  });

  it("龙动虎静: active rooms on 青龙 read positive; on 白虎 read negative", () => {
    // facing S → E is 青龙, W is 白虎.
    const dragonActive = assessFlanks("S", [
      { name: "Kitchen", sector: "E" }, // active, on the dragon
      { name: "Bedroom", sector: "W" }, // quiet, on the tiger
    ]);
    expect(dragonActive.quality).toBeGreaterThan(0);
    expect(dragonActive.factors[0].type).toBe("positive");
    expect(dragonActive.factors[0].principle).toBe("峦头");

    const tigerActive = assessFlanks("S", [
      { name: "Bedroom", sector: "E" }, // quiet, on the dragon
      { name: "Living", sector: "W" }, // active, on the tiger
    ]);
    expect(tigerActive.quality).toBeLessThan(0);
    expect(tigerActive.factors.some((f) => f.type === "negative")).toBe(true);
  });

  it("flags 白虎煞 (severity 3) when the stove sits on the 白虎 side", () => {
    const onTiger = assessFlanks("S", [{ name: "Kitchen", sector: "W" }]); // 白虎
    expect(onTiger.tigerStove).toBe(true);
    const sha = onTiger.factors.find(
      (f) => f.type === "negative" && f.severity === 3,
    );
    expect(sha).toBeTruthy();
    expect(sha?.principle).toBe("峦头");
    // The same stove on the dragon side is not 白虎煞.
    expect(assessFlanks("S", [{ name: "Kitchen", sector: "E" }]).tigerStove).toBe(
      false,
    );
  });

  it("always surfaces a 青龙白虎 factor in the full reading, tagged 峦头", () => {
    const r = computeUnitReading("S", 2024, [
      { name: "Kitchen", sector: "E" },
      { name: "Bedroom", sector: "W" },
    ]);
    expect(
      r.factors.some((f) => /青龙白虎|白虎/.test(f.title) && f.principle === "峦头"),
    ).toBe(true);
  });

  it("a stove on 白虎 lowers the score vs the same stove on 青龙", () => {
    const dragon = computeUnitReading("S", 2024, [{ name: "Kitchen", sector: "E" }]);
    const tiger = computeUnitReading("S", 2024, [{ name: "Kitchen", sector: "W" }]);
    expect(dragon.score).toBeGreaterThan(tiger.score);
  });

  it("emits no flank factor when nothing sits on either flank", () => {
    const r = computeUnitReading("S", 2024, [
      { name: "Hall", sector: "N" }, // axis (dead ahead)
      { name: "Store", sector: "center" }, // unplaceable
    ]);
    expect(r.factors.every((f) => !/青龙|白虎/.test(f.title))).toBe(true);
  });

  it("stays deterministic with the flank layer", () => {
    const rooms = [
      { name: "Kitchen", sector: "E" },
      { name: "Master Bedroom", sector: "W" },
    ];
    const a = computeUnitReading("S", 2024, rooms);
    const b = computeUnitReading("S", 2024, rooms);
    expect(a.score).toBe(b.score);
    expect(a.factors).toEqual(b.factors);
  });
});
