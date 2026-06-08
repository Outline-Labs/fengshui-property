import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, ensureSchema } from "./db";
import { rateLimits } from "./db/schema";

export type RateLimitResult = { ok: boolean; count: number; limit: number };

/**
 * Fixed-window per-key rate limit, backed by Turso — plan-independent (Vercel
 * Firewall rate limiting needs a paid plan; this works on any tier). Atomically
 * bumps the counter for the current window, then reports whether this request is
 * within `limit`.
 *
 * Fails OPEN on a DB error: the limiter must never take the site down on its own,
 * and the global MAX_DAILY_READINGS cap is the real cost backstop for the paid
 * path. The post-increment read can momentarily over-count under concurrency,
 * which only ever makes the limit slightly stricter at the boundary — safe.
 */
export async function rateLimit(p: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): Promise<RateLimitResult> {
  await ensureSchema();
  const now = p.now ?? Date.now();
  const windowStart = Math.floor(now / p.windowMs) * p.windowMs;
  try {
    await db.run(sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${p.key}, ${windowStart}, 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
    `);
    const rows = await db
      .select({ c: rateLimits.count })
      .from(rateLimits)
      .where(
        and(eq(rateLimits.key, p.key), eq(rateLimits.windowStart, windowStart)),
      )
      .limit(1);
    const count = rows[0]?.c ?? 1;
    return { ok: count <= p.limit, count, limit: p.limit };
  } catch {
    return { ok: true, count: 0, limit: p.limit };
  }
}

/**
 * Best-effort client IP from the proxy headers Vercel sets. The left-most entry
 * of x-forwarded-for is the originating client; x-real-ip is the fallback.
 */
export function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}
