import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Coords, POI, POICategory } from "../types";

// ---------------------------------------------------------------------------
// analyzeFormSchool() reads the real ../pois dataset (4483 SG POIs) via
// getNearestPOI / getPOIsNear. To assert the classical-rule thresholds
// deterministically we replace ../pois with a synthetic, test-controlled POI
// set. The mock re-implements the two helpers using the SAME haversine the
// real geo module uses, so distances are exact.
//
// Convention used by every fixture below: a POI placed at the base latitude +
// a pure-north offset of `m` metres sits at EXACTLY `m` metres from the base
// coordinate (longitude held constant), so each threshold (e.g. <=100, <=300)
// is hit precisely and unambiguously.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function haversine(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Mutable backing store the mock reads from; each test installs its own set.
let MOCK_POIS: POI[] = [];

vi.mock("../pois", () => ({
  getPOIsNear: (
    center: Coords,
    radiusMeters: number,
    categories?: readonly POICategory[],
  ) => {
    const src = categories
      ? MOCK_POIS.filter((p) => categories.includes(p.category))
      : MOCK_POIS;
    return src
      .map((p) => ({ ...p, distanceMeters: haversine(center, p) }))
      .filter((p) => p.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  },
  getNearestPOI: (center: Coords, categories: readonly POICategory[]) => {
    let best: (POI & { distanceMeters: number }) | null = null;
    for (const p of MOCK_POIS) {
      if (!categories.includes(p.category)) continue;
      const d = haversine(center, p);
      if (!best || d < best.distanceMeters) best = { ...p, distanceMeters: d };
    }
    return best;
  },
}));

// Import AFTER vi.mock is registered (vi.mock is hoisted, so this is fine).
import { analyzeFormSchool } from "./form-school";

const BASE: Coords = { lat: 1.3, lon: 103.8 };

/** Pure-north offset that lands a point exactly `meters` from BASE. */
function north(meters: number): number {
  return BASE.lat + (meters / EARTH_RADIUS_M) * (180 / Math.PI);
}

/** Build a synthetic POI exactly `meters` north of BASE. */
let idSeq = 0;
function poi(
  category: POICategory,
  meters: number,
  name = `${category}-${meters}m`,
): POI {
  idSeq += 1;
  return {
    id: `mock-${idSeq}`,
    category,
    name,
    lat: north(meters),
    lon: BASE.lon,
  };
}

/** Convenience: round-trip the score formula for an expected factor list. */
function expectedScore(factors: Array<{ type: "positive" | "negative"; severity: number }>): number {
  let s = 5;
  for (const f of factors) {
    const w = f.severity * 0.6;
    s += f.type === "positive" ? w : -w;
  }
  s = Math.max(0, Math.min(10, s));
  return Math.round(s * 10) / 10;
}

beforeEach(() => {
  MOCK_POIS = [];
  idSeq = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Empty / nothing-nearby cases
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — empty & nothing-nearby", () => {
  it("with no POIs at all: neutral base score, no factors, no landmark", () => {
    const r = analyzeFormSchool(BASE);
    expect(r.score).toBe(5);
    expect(r.factors).toEqual([]);
    expect(r.summary).toEqual({ positives: 0, negatives: 0 });
    expect(r.nearestLandmark).toBeUndefined();
  });

  it("ignores POIs that are all beyond every influence radius", () => {
    // Each just outside its respective trigger window.
    MOCK_POIS = [
      poi("cemetery", 600), // > 500
      poi("hospital", 400), // > 300
      poi("power_station", 250), // > 200
      poi("industrial", 250), // > 200
      poi("park", 600), // > 500
      poi("school", 600), // > 500
    ];
    const r = analyzeFormSchool(BASE);
    expect(r.score).toBe(5);
    expect(r.factors).toEqual([]);
    expect(r.summary).toEqual({ positives: 0, negatives: 0 });
    // No mrt_station among them, and the only landmark categories present
    // (park, school, hospital) are beyond the landmark search? — landmark
    // search has NO radius cap, so the nearest of those still surfaces.
    expect(r.nearestLandmark).toEqual({
      name: "hospital-400m",
      category: "hospital",
      distanceMeters: expect.closeTo(400, 3),
    });
  });
});

// ---------------------------------------------------------------------------
// Cemetery — three severity bands
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — cemetery severity bands", () => {
  it("<=100m → negative severity 3", () => {
    MOCK_POIS = [poi("cemetery", 90, "Choa Chu Kang Cemetery")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    const f = r.factors[0];
    expect(f.type).toBe("negative");
    expect(f.severity).toBe(3);
    expect(f.category).toBe("cemetery");
    // single-POI negatives carry the originating POI id as `reference`.
    expect(f.reference).toBe("mock-1");
    expect(f.distanceMeters).toBeCloseTo(90, 3);
    expect(r.summary).toEqual({ positives: 0, negatives: 1 });
    expect(r.score).toBe(expectedScore([{ type: "negative", severity: 3 }])); // 3.2
    expect(r.score).toBe(3.2);
  });

  it("(100, 300] → negative severity 2", () => {
    MOCK_POIS = [poi("cemetery", 250)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].severity).toBe(2);
    expect(r.factors[0].type).toBe("negative");
    expect(r.score).toBe(3.8); // 5 - 2*0.6
  });

  it("(300, 500] → negative severity 1", () => {
    MOCK_POIS = [poi("cemetery", 450)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].severity).toBe(1);
    expect(r.factors[0].type).toBe("negative");
    expect(r.score).toBe(4.4); // 5 - 1*0.6
  });

  it("exactly 500m is still in-band (severity 1); 501m is ignored", () => {
    MOCK_POIS = [poi("cemetery", 500)];
    expect(analyzeFormSchool(BASE).factors).toHaveLength(1);

    MOCK_POIS = [poi("cemetery", 501)];
    expect(analyzeFormSchool(BASE).factors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hospital — two severity bands, 300m cap
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — hospital", () => {
  it("<=100m → negative severity 2", () => {
    MOCK_POIS = [poi("hospital", 80, "Tan Tock Seng Hospital")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].category).toBe("hospital");
    expect(r.factors[0].type).toBe("negative");
    expect(r.factors[0].severity).toBe(2);
    expect(r.score).toBe(3.8);
  });

  it("(100, 300] → negative severity 1", () => {
    MOCK_POIS = [poi("hospital", 250)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].severity).toBe(1);
    expect(r.score).toBe(4.4);
  });

  it("beyond 300m → no hospital factor", () => {
    MOCK_POIS = [poi("hospital", 350)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(0);
    expect(r.score).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Power station & industrial — 200m cap, distance-dependent severity
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — power station", () => {
  it("<=75m → severity 2", () => {
    MOCK_POIS = [poi("power_station", 50)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].category).toBe("power_station");
    expect(r.factors[0].severity).toBe(2);
    expect(r.score).toBe(3.8);
  });

  it("(75, 200] → severity 1", () => {
    MOCK_POIS = [poi("power_station", 150)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors[0].severity).toBe(1);
    expect(r.score).toBe(4.4);
  });

  it("beyond 200m → ignored", () => {
    MOCK_POIS = [poi("power_station", 250)];
    expect(analyzeFormSchool(BASE).factors).toHaveLength(0);
  });
});

describe("analyzeFormSchool — industrial", () => {
  it("<=100m → severity 2", () => {
    MOCK_POIS = [poi("industrial", 80, "Jurong Industrial Estate")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].category).toBe("industrial");
    expect(r.factors[0].severity).toBe(2);
    expect(r.score).toBe(3.8);
  });

  it("(100, 200] → severity 1", () => {
    MOCK_POIS = [poi("industrial", 150)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors[0].severity).toBe(1);
    expect(r.score).toBe(4.4);
  });
});

// ---------------------------------------------------------------------------
// Parks — positive, with a gating rule (>=2 parks OR nearest <=200m)
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — parks (positive, gated)", () => {
  it("a single park between 200m and 500m does NOT qualify", () => {
    MOCK_POIS = [poi("park", 300)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(0);
    expect(r.score).toBe(5);
  });

  it("a single park <=200m qualifies → positive severity 1", () => {
    MOCK_POIS = [poi("park", 150, "Bishan Park")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].type).toBe("positive");
    expect(r.factors[0].category).toBe("park");
    expect(r.factors[0].severity).toBe(1);
    // park factor carries no reference (it's an aggregate, not a single POI).
    expect(r.factors[0].reference).toBeUndefined();
    expect(r.score).toBe(5.6); // 5 + 1*0.6
  });

  it("2 parks within 500m qualify even if both are >200m → severity 1", () => {
    MOCK_POIS = [poi("park", 300), poi("park", 400)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].type).toBe("positive");
    expect(r.factors[0].severity).toBe(1);
    // title reflects the count ("2 green spaces") and nearest distance.
    expect(r.factors[0].title).toContain("2 green space");
    expect(r.factors[0].distanceMeters).toBeCloseTo(300, 3);
    expect(r.score).toBe(5.6);
  });

  it("3 parks within 500m → severity 2", () => {
    MOCK_POIS = [poi("park", 250), poi("park", 350), poi("park", 450)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].severity).toBe(2);
    expect(r.factors[0].title).toContain("3 green space");
    expect(r.score).toBe(6.2); // 5 + 2*0.6
  });

  it("4+ parks within 500m → severity 3 (abundant greenery)", () => {
    MOCK_POIS = [poi("park", 200), poi("park", 300), poi("park", 400), poi("park", 480)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].severity).toBe(3);
    expect(r.factors[0].title).toContain("4 green space");
    expect(r.score).toBe(6.8); // 5 + 3*0.6
  });
});

// ---------------------------------------------------------------------------
// Water — positive, the strongest environmental factor (水主财). Three bands
// by proximity, mirroring the cemetery bands but favourable.
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — water (positive, 水主财)", () => {
  it("<=100m → waterfront, positive severity 3", () => {
    MOCK_POIS = [poi("water", 80, "Kallang River")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].type).toBe("positive");
    expect(r.factors[0].category).toBe("water");
    expect(r.factors[0].severity).toBe(3);
    expect(r.factors[0].reference).toBe("mock-1");
    expect(r.factors[0].title).toContain("Water frontage");
    expect(r.score).toBe(6.8); // 5 + 3*0.6
  });

  it("(100, 300] → positive severity 2", () => {
    MOCK_POIS = [poi("water", 250, "MacRitchie Reservoir")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors[0].severity).toBe(2);
    expect(r.factors[0].type).toBe("positive");
    expect(r.score).toBe(6.2); // 5 + 2*0.6
  });

  it("(300, 500] → positive severity 1", () => {
    MOCK_POIS = [poi("water", 450)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors[0].severity).toBe(1);
    expect(r.score).toBe(5.6); // 5 + 1*0.6
  });

  it("beyond 500m → no water factor", () => {
    MOCK_POIS = [poi("water", 600)];
    expect(analyzeFormSchool(BASE).factors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MRT — band of negatives close-in, positive in the walkable mid-range
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — MRT proximity bands", () => {
  it("<=50m → vibration sha, negative severity 2", () => {
    MOCK_POIS = [poi("mrt_station", 40, "Bishan")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].category).toBe("mrt_station");
    expect(r.factors[0].type).toBe("negative");
    expect(r.factors[0].severity).toBe(2);
    expect(r.score).toBe(3.8);
  });

  it("(50, 100] → negative severity 1", () => {
    MOCK_POIS = [poi("mrt_station", 80)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors[0].type).toBe("negative");
    expect(r.factors[0].severity).toBe(1);
    expect(r.score).toBe(4.4);
  });

  it("(100, 600] → positive (walkable) severity 1", () => {
    MOCK_POIS = [poi("mrt_station", 400, "Bishan")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].type).toBe("positive");
    expect(r.factors[0].severity).toBe(1);
    expect(r.score).toBe(5.6);
  });

  it("beyond 600m → no MRT factor at all", () => {
    MOCK_POIS = [poi("mrt_station", 700)];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(0);
    expect(r.score).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// School — positive within 500m
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — school", () => {
  it("<=500m → positive severity 1", () => {
    MOCK_POIS = [poi("school", 450, "Catholic High School")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].type).toBe("positive");
    expect(r.factors[0].category).toBe("school");
    expect(r.factors[0].severity).toBe(1);
    expect(r.score).toBe(5.6);
  });

  it("beyond 500m → ignored", () => {
    MOCK_POIS = [poi("school", 550)];
    expect(analyzeFormSchool(BASE).factors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// nearestLandmark selection
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — nearestLandmark", () => {
  it("picks the nearest among {mrt,park,school,religious,hospital} regardless of radius", () => {
    MOCK_POIS = [
      poi("school", 480, "Far School"),
      poi("religious", 120, "Sri Mariamman Temple"),
      poi("hospital", 250, "Some Hospital"),
    ];
    const r = analyzeFormSchool(BASE);
    expect(r.nearestLandmark).toEqual({
      name: "Sri Mariamman Temple",
      category: "religious",
      distanceMeters: expect.closeTo(120, 3),
    });
  });

  it("a religious POI alone surfaces as landmark but contributes NO factor", () => {
    // 'religious' is not scored by any rule, only used for landmark.
    MOCK_POIS = [poi("religious", 50, "Thian Hock Keng")];
    const r = analyzeFormSchool(BASE);
    expect(r.factors).toEqual([]);
    expect(r.score).toBe(5);
    expect(r.nearestLandmark).toEqual({
      name: "Thian Hock Keng",
      category: "religious",
      distanceMeters: expect.closeTo(50, 3),
    });
  });

  it("a landmark named '(unnamed)' is suppressed (undefined)", () => {
    MOCK_POIS = [poi("park", 150, "(unnamed)")];
    const r = analyzeFormSchool(BASE);
    // The park still scores as a positive factor...
    expect(r.factors).toHaveLength(1);
    expect(r.factors[0].category).toBe("park");
    // ...but the unnamed landmark is not exposed.
    expect(r.nearestLandmark).toBeUndefined();
  });

  it("categories not in the landmark set (cemetery, power, industrial) never become landmark", () => {
    MOCK_POIS = [
      poi("cemetery", 90),
      poi("power_station", 50),
      poi("industrial", 80),
    ];
    const r = analyzeFormSchool(BASE);
    expect(r.nearestLandmark).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Combined scenario: multiple factors, score clamping & rounding
// ---------------------------------------------------------------------------
describe("analyzeFormSchool — combined factors", () => {
  it("aggregates positives and negatives, clamps to [0,10], rounds to 1 dp", () => {
    MOCK_POIS = [
      poi("cemetery", 90), // negative sev 3  (-1.8)
      poi("hospital", 80), // negative sev 2  (-1.2)
      poi("mrt_station", 400, "Bishan"), // positive sev 1 (+0.6)
      poi("school", 450), // positive sev 1 (+0.6)
      poi("park", 150), // positive sev 1 (+0.6)
    ];
    const r = analyzeFormSchool(BASE);
    expect(r.summary).toEqual({ positives: 3, negatives: 2 });
    expect(r.factors).toHaveLength(5);
    // 5 - 1.8 - 1.2 + 0.6 + 0.6 + 0.6 = 3.8
    expect(r.score).toBe(
      expectedScore([
        { type: "negative", severity: 3 },
        { type: "negative", severity: 2 },
        { type: "positive", severity: 1 },
        { type: "positive", severity: 1 },
        { type: "positive", severity: 1 },
      ]),
    );
    expect(r.score).toBe(3.8);
    // nearest landmark of {mrt,park,school,religious,hospital}: hospital @80m.
    expect(r.nearestLandmark?.category).toBe("hospital");
    expect(r.nearestLandmark?.distanceMeters).toBeCloseTo(80, 3);
  });

  it("score floor is 0 (heavy negatives cannot go below zero)", () => {
    MOCK_POIS = [
      poi("cemetery", 90), // -1.8
      poi("hospital", 80), // -1.2
      poi("power_station", 50), // -1.2
      poi("industrial", 80), // -1.2
      poi("mrt_station", 40, "Bishan"), // -1.2
    ];
    const r = analyzeFormSchool(BASE);
    expect(r.summary).toEqual({ positives: 0, negatives: 5 });
    // raw 5 - 6.6 = -1.6 → clamped to 0
    expect(r.score).toBe(0);
  });

  it("a top-tier location (waterfront + abundant greenery + MRT + school) scores in the high 9s, never above 10", () => {
    MOCK_POIS = [
      poi("water", 80, "Marina Reservoir"), // positive sev 3 (+1.8)
      poi("park", 150),
      poi("park", 250),
      poi("park", 350),
      poi("park", 450), // 4 parks → positive sev 3 (+1.8)
      poi("mrt_station", 400, "Bayfront"), // positive sev 1 (+0.6)
      poi("school", 450), // positive sev 1 (+0.6)
    ];
    const r = analyzeFormSchool(BASE);
    // 5 + 1.8 + 1.8 + 0.6 + 0.6 = 9.8 — a usable "excellent" ceiling (water
    // lifted the old 7.4 cap), and the Math.min(10,…) guard still holds.
    expect(r.score).toBe(9.8);
    expect(r.score).toBeLessThanOrEqual(10);
    expect(r.summary).toEqual({ positives: 4, negatives: 0 });
  });
});
