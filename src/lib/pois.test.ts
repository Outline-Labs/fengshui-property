import { describe, expect, it } from "vitest";

import { distanceMeters } from "./geo";
import {
  getAllPOIs,
  getNearestPOI,
  getPOIsByCategory,
  getPOIsNear,
} from "./pois";
import type { POI, POICategory } from "./types";

// The eleven POI categories the type system permits. Every POI in the data
// set must belong to exactly one of these.
const VALID_CATEGORIES: readonly POICategory[] = [
  "cemetery",
  "hospital",
  "clinic",
  "park",
  "religious",
  "school",
  "mrt_station",
  "police_station",
  "fire_station",
  "power_station",
  "industrial",
];

// Singapore's land area sits within roughly these geographic bounds. Any POI
// outside this box would be a data error (wrong country / swapped lat&lon).
const SG_LAT_MIN = 1.15;
const SG_LAT_MAX = 1.48;
const SG_LON_MIN = 103.6;
const SG_LON_MAX = 104.1;

// A well-known anchor that exists in the data set. Used to make distance and
// nearest-neighbour assertions deterministic.
const ALJUNIED_MRT = {
  id: "node-206477134",
  lat: 1.3164515,
  lon: 103.8829087,
} as const;

describe("getAllPOIs", () => {
  it("returns a non-empty list of POIs", () => {
    const pois = getAllPOIs();
    expect(Array.isArray(pois)).toBe(true);
    expect(pois.length).toBeGreaterThan(0);
  });

  it("returns the same identity on repeated calls (serves the loaded data)", () => {
    expect(getAllPOIs()).toBe(getAllPOIs());
  });

  it("yields well-formed POIs: required string/number fields present", () => {
    for (const p of getAllPOIs()) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe("string");
      expect(typeof p.category).toBe("string");
      expect(typeof p.lat).toBe("number");
      expect(typeof p.lon).toBe("number");
      expect(Number.isFinite(p.lat)).toBe(true);
      expect(Number.isFinite(p.lon)).toBe(true);
    }
  });

  it("only uses categories declared in the POICategory union", () => {
    const allowed = new Set<string>(VALID_CATEGORIES);
    for (const p of getAllPOIs()) {
      expect(allowed.has(p.category)).toBe(true);
    }
  });

  it("places every POI inside Singapore's geographic bounds", () => {
    for (const p of getAllPOIs()) {
      expect(p.lat).toBeGreaterThanOrEqual(SG_LAT_MIN);
      expect(p.lat).toBeLessThanOrEqual(SG_LAT_MAX);
      expect(p.lon).toBeGreaterThanOrEqual(SG_LON_MIN);
      expect(p.lon).toBeLessThanOrEqual(SG_LON_MAX);
    }
  });

  it("has globally unique POI ids", () => {
    const pois = getAllPOIs();
    const ids = new Set(pois.map((p) => p.id));
    expect(ids.size).toBe(pois.length);
  });
});

describe("getPOIsByCategory", () => {
  it("returns only POIs of the requested category", () => {
    for (const category of VALID_CATEGORIES) {
      const result = getPOIsByCategory(category);
      for (const p of result) {
        expect(p.category).toBe(category);
      }
    }
  });

  it("partitions the data set exactly across all categories (no loss, no overlap)", () => {
    const total = getAllPOIs().length;
    const sum = VALID_CATEGORIES.reduce(
      (acc, c) => acc + getPOIsByCategory(c).length,
      0,
    );
    expect(sum).toBe(total);
  });

  it("returns a non-empty set for a category known to be populated", () => {
    expect(getPOIsByCategory("mrt_station").length).toBeGreaterThan(0);
  });

  it("returns an empty array for a category with no members", () => {
    // "foobar" is not a real category, so nothing should match. Cast through
    // unknown because the function signature only accepts real categories.
    const result = getPOIsByCategory("foobar" as unknown as POICategory);
    expect(result).toEqual([]);
  });
});

describe("getPOIsNear", () => {
  it("returns only POIs within the given radius, each annotated with its distance", () => {
    const radius = 1000;
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    const result = getPOIsNear(center, radius);

    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {
      expect(p.distanceMeters).toBeLessThanOrEqual(radius);
      // The recomputed distance must agree with the annotated one.
      expect(p.distanceMeters).toBeCloseTo(distanceMeters(center, p), 6);
    }
  });

  it("sorts results nearest-first", () => {
    const result = getPOIsNear(
      { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon },
      1000,
    );
    for (let i = 1; i < result.length; i++) {
      expect(result[i].distanceMeters).toBeGreaterThanOrEqual(
        result[i - 1].distanceMeters,
      );
    }
  });

  it("includes the anchor POI itself with ~zero distance at a tight radius", () => {
    const result = getPOIsNear(
      { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon },
      50,
    );
    // Aljunied station is the only POI within 50m of its own coordinates.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(ALJUNIED_MRT.id);
    expect(result[0].distanceMeters).toBeCloseTo(0, 6);
  });

  it("restricts to the requested categories when provided", () => {
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    const result = getPOIsNear(center, 2000, ["park", "school"]);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {
      expect(["park", "school"]).toContain(p.category);
      expect(p.distanceMeters).toBeLessThanOrEqual(2000);
    }
  });

  it("returns a subset of the unfiltered results when categories are given", () => {
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    const all = getPOIsNear(center, 2000);
    const onlyParks = getPOIsNear(center, 2000, ["park"]);
    expect(onlyParks.length).toBeLessThanOrEqual(all.length);

    const allParkIds = new Set(
      all.filter((p) => p.category === "park").map((p) => p.id),
    );
    const filteredIds = new Set(onlyParks.map((p) => p.id));
    expect(filteredIds).toEqual(allParkIds);
  });

  it("returns an empty array when nothing falls within the radius", () => {
    // A point in the open sea far south of Singapore; no POI is within 1km.
    const middleOfNowhere = { lat: 0.5, lon: 103.85 };
    expect(getPOIsNear(middleOfNowhere, 1000)).toEqual([]);
  });

  it("returns an empty array when an empty category list is supplied", () => {
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    expect(getPOIsNear(center, 5000, [])).toEqual([]);
  });
});

describe("getNearestPOI", () => {
  it("returns the closest POI of an allowed category", () => {
    // Raffles Place / CBD; the nearest MRT station in the data is Raffles Place.
    const center = { lat: 1.283, lon: 103.8513 };
    const nearest = getNearestPOI(center, ["mrt_station"]);
    expect(nearest).not.toBeNull();
    expect(nearest?.category).toBe("mrt_station");
    expect(nearest?.name).toBe("Raffles Place");
  });

  it("annotates the result with a distance that is truly the minimum over candidates", () => {
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    const nearest = getNearestPOI(center, ["mrt_station"]);
    expect(nearest).not.toBeNull();

    // The annotated distance must equal the recomputed Haversine distance...
    expect(nearest?.distanceMeters).toBeCloseTo(
      distanceMeters(center, nearest as POI),
      6,
    );
    // ...and no other MRT station may be closer.
    const minOverCandidates = Math.min(
      ...getPOIsByCategory("mrt_station").map((p) => distanceMeters(center, p)),
    );
    expect(nearest?.distanceMeters).toBeCloseTo(minOverCandidates, 6);
  });

  it("returns the anchor itself (distance ~0) when standing on a POI", () => {
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    const nearest = getNearestPOI(center, ["mrt_station"]);
    expect(nearest?.id).toBe(ALJUNIED_MRT.id);
    expect(nearest?.distanceMeters).toBeCloseTo(0, 6);
  });

  it("considers all listed categories and picks the overall closest", () => {
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    const categories: readonly POICategory[] = ["park", "school", "clinic"];
    const nearest = getNearestPOI(center, categories);
    expect(nearest).not.toBeNull();
    expect(categories).toContain(nearest?.category);

    const minOverCandidates = Math.min(
      ...getAllPOIs()
        .filter((p) => categories.includes(p.category))
        .map((p) => distanceMeters(center, p)),
    );
    expect(nearest?.distanceMeters).toBeCloseTo(minOverCandidates, 6);
  });

  it("returns null when no POI matches the requested categories", () => {
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    expect(
      getNearestPOI(center, ["bogus" as unknown as POICategory]),
    ).toBeNull();
  });

  it("returns null when an empty category list is supplied", () => {
    const center = { lat: ALJUNIED_MRT.lat, lon: ALJUNIED_MRT.lon };
    expect(getNearestPOI(center, [])).toBeNull();
  });
});
