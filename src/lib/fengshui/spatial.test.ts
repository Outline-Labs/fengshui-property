import { describe, expect, it } from "vitest";

import { buildChart, guaYun } from "./dagua";
import { hexagramForBearing } from "./bearing";
import {
  type FloorPlan,
  INFERRED_RULES,
  PENDING_RULES,
  assembleReading,
  branchSectorForBearing,
  centroid,
  compassBearing,
  flankOf,
} from "./spatial";

describe("centroid (中宫)", () => {
  it("is the centre of a square boundary", () => {
    const c = centroid([
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ]);
    expect(c.x).toBeCloseTo(0, 9);
    expect(c.y).toBeCloseTo(0, 9);
  });
});

describe("compassBearing (default map frame: +x=East, +y=North)", () => {
  const O = { x: 0, y: 0 };
  it("maps the four directions", () => {
    expect(compassBearing(O, { x: 0, y: 1 })).toBeCloseTo(0, 6); // North
    expect(compassBearing(O, { x: 1, y: 0 })).toBeCloseTo(90, 6); // East
    expect(compassBearing(O, { x: 0, y: -1 })).toBeCloseTo(180, 6); // South
    expect(compassBearing(O, { x: -1, y: 0 })).toBeCloseTo(270, 6); // West
  });
});

describe("branchSectorForBearing (12 × 30° bands)", () => {
  it("labels the branch directions", () => {
    expect(branchSectorForBearing(0)).toBe("N");
    expect(branchSectorForBearing(90)).toBe("E");
    expect(branchSectorForBearing(180)).toBe("S");
    expect(branchSectorForBearing(270)).toBe("W");
    expect(branchSectorForBearing(60)).toBe("ENE");
    expect(branchSectorForBearing(359)).toBe("N"); // wraps
  });
});

describe("flankOf — form-school 青龙/白虎 (facing the door)", () => {
  const center = { x: 0, y: 0 };
  const doorNorth = { x: 0, y: 10 };
  it("left of the facing axis is 青龙, right is 白虎, on-axis is axis", () => {
    // Facing North: West is on your left (青龙), East on your right (白虎).
    expect(flankOf(center, doorNorth, { x: -5, y: 0 })).toBe("青龙");
    expect(flankOf(center, doorNorth, { x: 5, y: 0 })).toBe("白虎");
    expect(flankOf(center, doorNorth, { x: 0, y: 5 })).toBe("axis");
  });
});

describe("assembleReading — deterministic overlay, gated verdicts", () => {
  const chart = buildChart("风天小畜"); // verified Layer-B chart
  const plan: FloorPlan = {
    boundary: [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ],
    door: { x: 0, y: 10 }, // North door
    rooms: [
      { id: "r1", label: "living", center: { x: 0, y: 5 } }, // N, on-axis
      { id: "r2", label: "bedroom", center: { x: 5, y: 0 } }, // E, 白虎
      { id: "r3", label: "kitchen", center: { x: -5, y: 0 } }, // W, 青龙
    ],
  };
  const r = assembleReading(chart, plan, 9);

  it("places the 中宫 and each room's sector + flank", () => {
    expect(r.center.x).toBeCloseTo(0, 9);
    const bed = r.rooms.find((x) => x.room.label === "bedroom")!;
    const kit = r.rooms.find((x) => x.room.label === "kitchen")!;
    const liv = r.rooms.find((x) => x.room.label === "living")!;
    expect(bed.sector).toBe("E");
    expect(bed.flank).toBe("白虎");
    expect(kit.sector).toBe("W");
    expect(kit.flank).toBe("青龙");
    expect(liv.sector).toBe("N");
    expect(liv.flank).toBe("axis");
  });

  it("ties rooms to the chart lines sharing their sector (fact, not verdict)", () => {
    const bed = r.rooms.find((x) => x.room.label === "bedroom")!;
    // 小畜 line 6 is 卯 (E) — the bedroom's sector.
    expect(bed.chartLines.map((l) => l.ganzhi)).toEqual(["辛卯"]);
    const liv = r.rooms.find((x) => x.room.label === "living")!;
    // 小畜 line 1 is 子 (N).
    expect(liv.chartLines.map((l) => l.ganzhi)).toEqual(["甲子"]);
    // West has no line in 小畜.
    const kit = r.rooms.find((x) => x.room.label === "kitchen")!;
    expect(kit.chartLines).toEqual([]);
  });

  it("identifies the 明堂 as the room the door opens into", () => {
    expect(r.mingTang.room?.label).toBe("living");
  });

  it("attaches an INFERRED 旺/衰 verdict per room (當令為旺, Period 9)", () => {
    for (const room of r.rooms) {
      expect(["旺", "衰"]).toContain(room.wangShuai.status);
      expect(room.wangShuai.inferred).toBe(true);
      // 旺 ⟺ the sector hexagram's 卦運 == the period.
      expect(room.wangShuai.status === "旺").toBe(room.wangShuai.guaYun === 9);
    }
    // Under 归藏 this plan's rooms are all off-period: N→复(運8), E→临(運4),
    // W→遁(運4) — all 衰/退氣.
    for (const room of r.rooms) {
      expect(room.wangShuai.status).toBe("衰");
      expect(room.wangShuai.role).toBe("退氣");
      expect(room.wangShuai.wants).toBeNull();
    }
    // The 正神/山 and 零神/水 paths, exercised directly on the rule: 運9 (旺/正神/山)
    // sits at 19.69° (风雷益); 運1 (零神/水) at 25.31° (震为雷).
    const wang = INFERRED_RULES.sectorWangShuai(19.6875, 9);
    expect(wang).toMatchObject({ status: "旺", role: "正神", wants: "山" });
    const zero = INFERRED_RULES.sectorWangShuai(25.3125, 9);
    expect(zero).toMatchObject({ status: "衰", role: "零神", wants: "水" });
  });

  it("derives 财位 = the 零神 (運1) directions, and placement verdicts", () => {
    expect(r.wealth.bearings.length).toBe(8); // 運1 appears 8× around the ring
    // every 财位 bearing's ring hexagram is 運1 (零神)
    for (const b of r.wealth.bearings) {
      expect(guaYun(hexagramForBearing(b))).toBe(1);
    }
    // the door sits in N (复, 運8) → 衰, so it is NOT a favourable door placement
    // (under 归藏; it read 旺 under the old 10−upper rule).
    const door = r.placements.find((p) => p.feature === "door")!;
    expect(door.favorable).toBe(false);
    expect(r.inferred).toBe(true);
  });

  it("PENDING_RULES opt-out withholds every verdict", () => {
    const p = assembleReading(chart, plan, 9, PENDING_RULES);
    for (const room of p.rooms) expect(room.wangShuai.status).toBe("pending");
    expect(p.wealth.bearings).toEqual([]);
    expect(p.inferred).toBe(false);
  });
});
