import { describe, expect, it } from "vitest";

import type { Coords } from "./types";
import {
  bearingDegrees,
  bearingToCardinal,
  distanceMeters,
  pointsWithinRadius,
} from "./geo";

// Spec: these are pure great-circle helpers on a spherical Earth of radius
// 6_371_000 m. Expected values below are computed independently (by hand /
// reference formulas), NOT copied from the implementation.

describe("distanceMeters (haversine)", () => {
  it("is zero for identical points", () => {
    const p: Coords = { lat: 1.3521, lon: 103.8198 };
    expect(distanceMeters(p, p)).toBe(0);
    expect(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  });

  it("is symmetric", () => {
    const a: Coords = { lat: 1.2834, lon: 103.8607 };
    const b: Coords = { lat: 1.2893, lon: 103.8631 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 9);
  });

  it("matches a hand-verified SG pair (Marina Bay Sands -> Singapore Flyer)", () => {
    // Independently computed great-circle distance ~ 708.226 m.
    const mbs: Coords = { lat: 1.2834, lon: 103.8607 };
    const flyer: Coords = { lat: 1.2893, lon: 103.8631 };
    expect(distanceMeters(mbs, flyer)).toBeCloseTo(708.226, 2);
  });

  it("matches one degree of latitude at a meridian (~111.195 km)", () => {
    // 1 deg of latitude on a sphere of R=6_371_000 m = R * (pi/180) ~ 111194.927 m.
    const d = distanceMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeCloseTo(111194.927, 2);
  });

  it("returns half the great circle for antipodal points", () => {
    // (0,0) to (0,180) is antipodal: distance = pi * R.
    const d = distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(d).toBeCloseTo(Math.PI * 6_371_000, 5);
    expect(d).toBeCloseTo(20015086.796, 1);
  });

  it("treats longitude difference at the equator like the meridian case", () => {
    // Along the equator, lon and lat degrees subtend the same arc length.
    const lat = distanceMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    const lon = distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(lon).toBeCloseTo(lat, 6);
  });
});

describe("bearingDegrees", () => {
  it("returns 0 for due north", () => {
    expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(
      0,
      9,
    );
  });

  it("returns 90 for due east", () => {
    expect(bearingDegrees({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(
      90,
      9,
    );
  });

  it("returns 180 for due south", () => {
    expect(bearingDegrees({ lat: 1, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(
      180,
      9,
    );
  });

  it("returns 270 for due west (normalised into [0,360))", () => {
    expect(bearingDegrees({ lat: 0, lon: 1 }, { lat: 0, lon: 0 })).toBeCloseTo(
      270,
      9,
    );
  });

  it("always normalises into the [0, 360) range", () => {
    const b = bearingDegrees({ lat: 1, lon: 1 }, { lat: 0, lon: 0 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe("bearingToCardinal", () => {
  it("maps the four primary directions", () => {
    expect(bearingToCardinal(0)).toBe("N");
    expect(bearingToCardinal(90)).toBe("E");
    expect(bearingToCardinal(180)).toBe("S");
    expect(bearingToCardinal(270)).toBe("W");
  });

  it("maps the four intercardinal directions", () => {
    expect(bearingToCardinal(45)).toBe("NE");
    expect(bearingToCardinal(135)).toBe("SE");
    expect(bearingToCardinal(225)).toBe("SW");
    expect(bearingToCardinal(315)).toBe("NW");
  });

  it("snaps at the 22.5-degree sector boundaries", () => {
    // North spans (-22.5, 22.5]; the boundary at 22.5 rolls into NE.
    expect(bearingToCardinal(22.4)).toBe("N");
    expect(bearingToCardinal(22.6)).toBe("NE");
    // The wrap-around boundary back into N.
    expect(bearingToCardinal(337.4)).toBe("NW");
    expect(bearingToCardinal(337.6)).toBe("N");
    expect(bearingToCardinal(359.9)).toBe("N");
  });
});

describe("pointsWithinRadius", () => {
  type POI = Coords & { id: string };

  const center: Coords = { lat: 0, lon: 0 };

  // Points at increasing latitude => increasing distance from the equator origin.
  // 0.001 deg lat ~ 111.195 m, 0.002 ~ 222.390 m, 0.01 ~ 1111.949 m.
  const near: POI = { id: "near", lat: 0.001, lon: 0 }; // ~111 m
  const mid: POI = { id: "mid", lat: 0.002, lon: 0 }; // ~222 m
  const far: POI = { id: "far", lat: 0.01, lon: 0 }; // ~1112 m

  it("returns only points within (<=) the radius", () => {
    const result = pointsWithinRadius(center, [near, mid, far], 300);
    expect(result.map((p) => p.id)).toEqual(["near", "mid"]);
  });

  it("excludes points beyond the radius", () => {
    const result = pointsWithinRadius(center, [far], 300);
    expect(result).toEqual([]);
  });

  it("includes a point exactly at the radius boundary (inclusive)", () => {
    const exact = distanceMeters(center, near);
    const result = pointsWithinRadius(center, [near], exact);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("near");
  });

  it("sorts results ascending by distance", () => {
    const result = pointsWithinRadius(center, [far, near, mid], 2000);
    expect(result.map((p) => p.id)).toEqual(["near", "mid", "far"]);
    expect(result[0].distanceMeters).toBeLessThan(result[1].distanceMeters);
    expect(result[1].distanceMeters).toBeLessThan(result[2].distanceMeters);
  });

  it("annotates each result with its computed distanceMeters", () => {
    const result = pointsWithinRadius(center, [near], 1000);
    expect(result[0].distanceMeters).toBeCloseTo(111.195, 2);
    // Original fields are preserved.
    expect(result[0].id).toBe("near");
    expect(result[0].lat).toBe(0.001);
  });

  it("returns an empty array for an empty point list", () => {
    expect(pointsWithinRadius(center, [], 1000)).toEqual([]);
  });

  it("returns nothing for a zero radius (unless the point is the centre)", () => {
    expect(pointsWithinRadius(center, [near], 0)).toEqual([]);
    const atCenter: POI = { id: "c", lat: 0, lon: 0 };
    const result = pointsWithinRadius(center, [atCenter], 0);
    expect(result).toHaveLength(1);
    expect(result[0].distanceMeters).toBe(0);
  });

  it("does not mutate the input array order", () => {
    const input = [far, near, mid];
    const snapshot = input.map((p) => p.id);
    pointsWithinRadius(center, input, 2000);
    expect(input.map((p) => p.id)).toEqual(snapshot);
  });
});
