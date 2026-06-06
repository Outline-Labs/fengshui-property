import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureSchema } from "./db";
import { readingCache } from "./db/schema";
import {
  getCachedReading,
  putCachedReading,
  readingKey,
} from "./reading-cache";
import type { FloorPlanAnalysis } from "./types";

beforeEach(async () => {
  await ensureSchema();
  await db.delete(readingCache);
});

const ANALYSIS: FloorPlanAnalysis = {
  score: 7.2,
  summary: "ok",
  facing: "South",
  rooms: [{ name: "Kitchen", sector: "SE" }],
  factors: [],
  recommendations: [],
  confidence: "high",
};

describe("readingKey", () => {
  it("is stable for identical inputs and distinct for different ones", () => {
    const a = readingKey("data:image/png;base64,AAAA", "South", 2024);
    const b = readingKey("data:image/png;base64,AAAA", "South", 2024);
    expect(a).toBe(b);
    expect(a).not.toBe(readingKey("data:image/png;base64,AAAA", "North", 2024));
    expect(a).not.toBe(readingKey("data:image/png;base64,BBBB", "South", 2024));
    expect(a).not.toBe(readingKey("data:image/png;base64,AAAA", "South", 2025));
  });
});

describe("reading cache round-trip", () => {
  it("returns null on a miss, then the stored analysis on a hit", async () => {
    const key = readingKey("data:image/png;base64,AAAA", "South", 2024);
    expect(await getCachedReading(key)).toBeNull();

    await putCachedReading(key, ANALYSIS);
    expect(await getCachedReading(key)).toEqual(ANALYSIS);
  });

  it("upserts — a re-store overwrites without error", async () => {
    const key = readingKey("data:image/png;base64,AAAA", "South", 2024);
    await putCachedReading(key, ANALYSIS);
    await putCachedReading(key, { ...ANALYSIS, score: 9.1 });
    const got = await getCachedReading(key);
    expect(got?.score).toBe(9.1);
  });
});
