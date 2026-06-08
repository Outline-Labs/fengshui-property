import { beforeEach, describe, expect, it } from "vitest";

import { db, ensureSchema } from "./db";
import { rateLimits } from "./db/schema";
import { clientIp, rateLimit } from "./rate-limit";

beforeEach(async () => {
  await ensureSchema();
  await db.delete(rateLimits);
});

// ---------------------------------------------------------------------------
// rateLimit is a fixed-window counter against the real (test) DB. `now` is
// injected so the window math is deterministic without touching the clock.
// ---------------------------------------------------------------------------
describe("rateLimit — fixed-window counter", () => {
  it("allows up to the limit, then blocks within the same window", async () => {
    const key = "test:a";
    const t = 1_000_000;
    const out = [];
    for (let i = 0; i < 5; i++) {
      out.push(await rateLimit({ key, limit: 3, windowMs: 600_000, now: t }));
    }
    expect(out.map((r) => r.ok)).toEqual([true, true, true, false, false]);
    expect(out.map((r) => r.count)).toEqual([1, 2, 3, 4, 5]);
    expect(out[3].limit).toBe(3);
  });

  it("resets the count in the next window", async () => {
    const key = "test:b";
    const w = 600_000;
    expect((await rateLimit({ key, limit: 1, windowMs: w, now: 0 })).ok).toBe(true);
    // same window (now < w) → blocked
    expect((await rateLimit({ key, limit: 1, windowMs: w, now: 100 })).ok).toBe(false);
    // next window (now >= w) → allowed again
    expect((await rateLimit({ key, limit: 1, windowMs: w, now: w + 1 })).ok).toBe(true);
  });

  it("counts each key independently", async () => {
    const w = 600_000;
    const t = 5_000;
    expect((await rateLimit({ key: "k1", limit: 1, windowMs: w, now: t })).ok).toBe(true);
    expect((await rateLimit({ key: "k1", limit: 1, windowMs: w, now: t })).ok).toBe(false);
    // a different key has its own budget
    expect((await rateLimit({ key: "k2", limit: 1, windowMs: w, now: t })).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the left-most x-forwarded-for entry (the originating client)", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe(
      "1.2.3.4",
    );
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
