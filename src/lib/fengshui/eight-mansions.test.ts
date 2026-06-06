import { describe, expect, it } from "vitest";

import { type Dir8 } from "./flying-stars";
import { eightMansions } from "./eight-mansions";

// ---------------------------------------------------------------------------
// 八宅 is uncontested classical method. The 游星 between two trigrams is a mutual
// relationship, so the whole table is checkable against the canonical layouts:
// 坐北朝南 = 坎宅 (东四宅); 坐西朝东 = 兑宅 (西四宅).
// ---------------------------------------------------------------------------
describe("eightMansions — 坎宅 (facing S, sitting N)", () => {
  const m = eightMansions("S");

  it("is the 坎 house, 东四宅", () => {
    expect(m.sitting).toBe("N");
    expect(m.houseGua).toBe("坎");
    expect(m.group).toBe("东四宅");
  });

  it("places the four 吉方 on the East-group directions", () => {
    // 坎宅: 巽生气 / 震天医 / 离延年 / 坎伏位
    expect(m.directions.SE.star).toBe("生气");
    expect(m.directions.E.star).toBe("天医");
    expect(m.directions.S.star).toBe("延年");
    expect(m.directions.N.star).toBe("伏位");
    for (const d of ["SE", "E", "S", "N"] as Dir8[]) {
      expect(m.directions[d].auspicious).toBe(true);
    }
  });

  it("places the four 凶方 on the West-group directions", () => {
    // 坎宅: 坤绝命 / 兑五鬼 / 乾六煞 / 艮祸害
    expect(m.directions.SW.star).toBe("绝命");
    expect(m.directions.W.star).toBe("五鬼");
    expect(m.directions.NW.star).toBe("六煞");
    expect(m.directions.NE.star).toBe("祸害");
    for (const d of ["SW", "W", "NW", "NE"] as Dir8[]) {
      expect(m.directions[d].auspicious).toBe(false);
    }
  });

  it("scores 生气/绝命 strongest, 伏位/祸害 mildest", () => {
    expect(m.directions.SE.level).toBe(3); // 生气
    expect(m.directions.SW.level).toBe(-3); // 绝命
    expect(m.directions.N.level).toBe(1); // 伏位
    expect(m.directions.NE.level).toBe(-1); // 祸害
  });
});

describe("eightMansions — 兑宅 (facing E, sitting W)", () => {
  const m = eightMansions("E");

  it("is the 兑 house, 西四宅, with West-group 吉方", () => {
    expect(m.houseGua).toBe("兑");
    expect(m.group).toBe("西四宅");
    expect(m.directions.NW.star).toBe("生气"); // 乾
    expect(m.directions.SW.star).toBe("天医"); // 坤
    expect(m.directions.NE.star).toBe("延年"); // 艮
    expect(m.directions.W.star).toBe("伏位"); // 兑 (sitting)
  });

  it("puts the 凶方 on the East-group directions", () => {
    expect(m.directions.E.star).toBe("绝命"); // 震
    expect(m.directions.N.star).toBe("五鬼"); // 坎
    expect(m.directions.SE.star).toBe("六煞"); // 巽
    expect(m.directions.S.star).toBe("祸害"); // 离
  });
});

describe("eightMansions — structural invariants over all 8 facings", () => {
  it("every house has exactly four 吉 and four 凶 directions", () => {
    for (const f of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as Dir8[]) {
      const m = eightMansions(f);
      const dirs = Object.values(m.directions);
      expect(dirs.filter((d) => d.auspicious)).toHaveLength(4);
      expect(dirs.filter((d) => !d.auspicious)).toHaveLength(4);
      // the sitting direction is always 伏位 (the house gua itself)
      expect(m.directions[m.sitting].star).toBe("伏位");
    }
  });
});
