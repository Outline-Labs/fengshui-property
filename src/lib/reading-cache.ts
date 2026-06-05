import "server-only";

import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db, ensureSchema } from "./db";
import { readingCache } from "./db/schema";
import type { FloorPlanAnalysis } from "./types";

/**
 * Content key for a reading: a hash of the exact image bytes + facing + year.
 * The same upload of the same plan produces the same key, so we can return the
 * same reading instead of re-running the (non-deterministic) vision model.
 */
export function readingKey(
  imageDataUrl: string,
  facing: string,
  year?: number,
): string {
  return crypto
    .createHash("sha256")
    .update(`${imageDataUrl}\n${facing.trim().toLowerCase()}\n${year ?? ""}`)
    .digest("hex");
}

export async function getCachedReading(
  key: string,
): Promise<FloorPlanAnalysis | null> {
  await ensureSchema();
  const r = await db
    .select({ analysis: readingCache.analysis })
    .from(readingCache)
    .where(eq(readingCache.key, key))
    .limit(1);
  if (!r[0]) return null;
  try {
    return JSON.parse(r[0].analysis) as FloorPlanAnalysis;
  } catch {
    return null; // corrupt row — treat as a miss, it'll be overwritten
  }
}

export async function putCachedReading(
  key: string,
  analysis: FloorPlanAnalysis,
): Promise<void> {
  await ensureSchema();
  // Upsert so a re-computation refreshes the row idempotently.
  await db.run(sql`
    INSERT INTO reading_cache (key, analysis, created_at)
    VALUES (${key}, ${JSON.stringify(analysis)}, ${Date.now()})
    ON CONFLICT(key) DO UPDATE SET analysis = excluded.analysis, created_at = excluded.created_at
  `);
}
