import { describe, expect, it } from "vitest";

import {
  mountainForBearing,
  oppositeMountain,
  readingFromBearing,
  sittingFacingFromBearing,
} from "./bearing";

describe("mountainForBearing — 24-mountain bands (15° each, 子 on north)", () => {
  it("maps cardinal/known bearings to the right mountain", () => {
    expect(mountainForBearing(0)).toBe("子");
    expect(mountainForBearing(15)).toBe("癸");
    expect(mountainForBearing(90)).toBe("卯");
    expect(mountainForBearing(150)).toBe("巳"); // the worked example's sitting
    expect(mountainForBearing(180)).toBe("午");
    expect(mountainForBearing(330)).toBe("亥"); // its facing
    expect(mountainForBearing(345)).toBe("壬");
  });

  it("snaps within the ±7.5° band and wraps past 360", () => {
    expect(mountainForBearing(143)).toBe("巳"); // 142.5–157.5 band
    expect(mountainForBearing(157)).toBe("巳");
    expect(mountainForBearing(359)).toBe("子"); // wraps to 0
    expect(mountainForBearing(360)).toBe("子");
    expect(mountainForBearing(-15)).toBe("壬"); // 345
  });
});

describe("oppositeMountain — sitting ↔ facing (180°)", () => {
  it("pairs opposites", () => {
    expect(oppositeMountain("巳")).toBe("亥");
    expect(oppositeMountain("亥")).toBe("巳");
    expect(oppositeMountain("子")).toBe("午");
    expect(oppositeMountain("癸")).toBe("丁");
  });
});

describe("sittingFacingFromBearing", () => {
  it("resolves the verified 巳→小畜 / 亥→豫 anchor", () => {
    const r = sittingFacingFromBearing(150);
    expect(r.sittingMountain).toBe("巳");
    expect(r.facingMountain).toBe("亥");
    expect(r.sittingHexagram).toBe("风天小畜");
    expect(r.facingHexagram).toBe("雷地豫");
    expect(r.pendingTranscription).toBe(false);
  });

  it("marks an un-transcribed mountain as pending (no fabricated hexagram)", () => {
    const r = sittingFacingFromBearing(45); // 艮 — not a verified anchor
    expect(r.sittingMountain).toBe("艮");
    expect(r.sittingHexagram).toBeNull();
    expect(r.facingHexagram).toBeNull();
    expect(r.pendingTranscription).toBe(true);
  });
});

describe("readingFromBearing — Layer A → Layer B end to end", () => {
  it("flows the worked example bearing into the verified Da Gua chart", () => {
    const r = readingFromBearing(150, "丙");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.chart.hexagram).toBe("风天小畜");
      expect(r.chart.worldLine).toBe(1);
      expect(r.chart.yuanshen).toBe("辛丑");
      expect(r.facingChart?.hexagram).toBe("雷地豫");
    }
  });

  it("returns a pending result (not a guess) for an un-transcribed mountain", () => {
    const r = readingFromBearing(45);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("pending_transcription");
      expect(r.sitting.sittingMountain).toBe("艮");
    }
  });
});
