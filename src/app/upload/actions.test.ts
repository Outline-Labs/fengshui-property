import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// analyzeFloorPlan is the seam where the LLM (perception) meets the
// deterministic engine (verdict). We mock the LLM + the credit/session
// collaborators, but run the REAL Flying-Stars/Eight-Mansions engine, and assert
// the engine — not the model — owns the score and the 八宅/玄空飞星 factors.
// ---------------------------------------------------------------------------

const getLeadId = vi.fn<() => Promise<string | null>>(async () => "lead-1");
vi.mock("@/lib/session", () => ({ getLeadId: () => getLeadId() }));

const reserveReading = vi.fn(async () => ({ ok: true, id: "res-1", remaining: 2 }));
const finalizeReading = vi.fn(async () => {});
const releaseReading = vi.fn(async () => {});
const getCredits = vi.fn(async () => ({ remaining: 5 }));
const getLead = vi.fn(async () => ({ emailVerified: 1 }));
const floorPlanReadingsSince = vi.fn(async () => 0);
vi.mock("@/lib/leads", () => ({
  reserveReading: (...a: unknown[]) => reserveReading(...a),
  finalizeReading: (...a: unknown[]) => finalizeReading(...a),
  releaseReading: (...a: unknown[]) => releaseReading(...a),
  getCredits: (...a: unknown[]) => getCredits(...a),
  getLead: (...a: unknown[]) => getLead(...a),
  floorPlanReadingsSince: (...a: unknown[]) => floorPlanReadingsSince(...a),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  verifyOtpAndRequestAgent: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({ applyReferralActivation: vi.fn(async () => {}) }));

const analyzeFloorPlanImage = vi.fn();
vi.mock("@/lib/kimi", () => ({
  analyzeFloorPlanImage: (p: unknown) => analyzeFloorPlanImage(p),
}));

const getCachedReading = vi.fn<() => Promise<unknown>>(async () => null);
const putCachedReading = vi.fn(async () => {});
vi.mock("@/lib/reading-cache", () => ({
  readingKey: () => "test-key",
  getCachedReading: () => getCachedReading(),
  putCachedReading: (...a: unknown[]) => putCachedReading(...a),
}));

// The action reads the client IP + per-IP rate limit on the paid path. Mock both
// so the suite doesn't need a request context or the DB; rateLimit defaults to ok.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const rateLimit = vi.fn(async () => ({ ok: true, count: 1, limit: 12 }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
  clientIp: () => "test-ip",
}));

import { computeUnitReading } from "@/lib/fengshui/unit-reading";

import { analyzeFloorPlan, recomputeReading } from "./actions";

const IMG = "data:image/png;base64,AAAA";

// A model reply whose score (9.9) the engine can never produce — so an override
// is provable — and whose factors mix a form-school note with a stray 八宅 opinion.
const LLM = {
  score: 9.9,
  summary: "ok",
  facing: "South",
  confidence: "high" as const,
  rooms: [
    { name: "Kitchen", sector: "SE" },
    { name: "Bathroom", sector: "SW" },
  ],
  factors: [
    { type: "negative" as const, severity: 2 as const, title: "Beam over the bed", principle: "峦头", description: "form school" },
    { type: "positive" as const, severity: 3 as const, title: "LLM eight-mansions opinion", principle: "八宅", description: "should be dropped" },
  ],
  recommendations: [{ title: "r", detail: "d" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getLeadId.mockResolvedValue("lead-1");
  reserveReading.mockResolvedValue({ ok: true, id: "res-1", remaining: 2 });
  analyzeFloorPlanImage.mockResolvedValue(LLM);
  getCachedReading.mockResolvedValue(null);
  getCredits.mockResolvedValue({ remaining: 5 });
  getLead.mockResolvedValue({ emailVerified: 1 });
  floorPlanReadingsSince.mockResolvedValue(0);
  rateLimit.mockResolvedValue({ ok: true, count: 1, limit: 12 });
});

describe("analyzeFloorPlan — input + spend guards", () => {
  it("blocks an UNVERIFIED-email lead before any reading (even the free cache path)", async () => {
    getLead.mockResolvedValue({ emailVerified: 0 });
    // Even a cache hit must not be served to an unverified lead.
    getCachedReading.mockResolvedValue({
      score: 6,
      summary: "x",
      facing: "South",
      confidence: "high" as const,
      rooms: [],
      factors: [],
      recommendations: [],
    });
    const res = await analyzeFloorPlan(IMG, "South", 2024);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("verify_email");
    expect(getCachedReading).not.toHaveBeenCalled(); // gated above the cache
    expect(analyzeFloorPlanImage).not.toHaveBeenCalled();
    expect(reserveReading).not.toHaveBeenCalled();
  });

  it("rejects a non-raster (e.g. SVG) image before any model call", async () => {
    const res = await analyzeFloorPlan("data:image/svg+xml,<svg/>", "South", 2024);
    expect(res.ok).toBe(false);
    expect(analyzeFloorPlanImage).not.toHaveBeenCalled();
    expect(reserveReading).not.toHaveBeenCalled();
  });

  it("rejects an oversized image (decoded > cap) before any model call", async () => {
    const huge = "data:image/png;base64," + "A".repeat(4_000_000); // ~3MB decoded
    const res = await analyzeFloorPlan(huge, "South", 2024);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/too large/i);
    expect(analyzeFloorPlanImage).not.toHaveBeenCalled();
  });

  it("trips the global daily circuit-breaker once the rolling cap is hit", async () => {
    floorPlanReadingsSince.mockResolvedValue(999_999);
    const res = await analyzeFloorPlan(IMG, "South", 2024);
    expect(res.ok).toBe(false);
    expect(analyzeFloorPlanImage).not.toHaveBeenCalled(); // no Kimi spend
    expect(reserveReading).not.toHaveBeenCalled(); // no credit charged
  });

  it("blocks the paid path when the per-IP rate limit is exceeded (no model call, no credit)", async () => {
    rateLimit.mockResolvedValue({ ok: false, count: 13, limit: 12 });
    const res = await analyzeFloorPlan(IMG, "South", 2024);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/too many/i);
    expect(analyzeFloorPlanImage).not.toHaveBeenCalled();
    expect(reserveReading).not.toHaveBeenCalled();
  });

  it("does NOT rate-limit a cache hit (free path returns before the limiter)", async () => {
    getCachedReading.mockResolvedValue({
      score: 6.4,
      summary: "cached",
      facing: "South",
      confidence: "high" as const,
      rooms: [],
      factors: [],
      recommendations: [],
    });
    const res = await analyzeFloorPlan(IMG, "South", 2024);
    expect(res.ok).toBe(true);
    expect(rateLimit).not.toHaveBeenCalled();
  });
});

describe("analyzeFloorPlan — deterministic engine wiring", () => {
  it("replaces the LLM score with the computed engine score and attaches the engine summary", async () => {
    const res = await analyzeFloorPlan(IMG, "South", 2024);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const det = computeUnitReading("S", 2024, LLM.rooms);
    expect(res.analysis.score).toBe(det.score);
    expect(res.analysis.score).not.toBe(9.9);
    expect(res.analysis.engine).toBeDefined();
    expect(res.analysis.engine!.group).toBe("东四宅"); // facing S → 坎 house
    expect(res.analysis.engine!.houseGua).toBe("坎");
    // the DETERMINISTIC score (not the model's 9.9) is what gets persisted
    expect(finalizeReading).toHaveBeenCalledWith("res-1", "South", det.score);
  });

  it("keeps the LLM's 峦头 factors but swaps its 八宅/飞星 opinions for the engine's", async () => {
    const res = await analyzeFloorPlan(IMG, "South", 2024);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const titles = res.analysis.factors.map((f) => f.title);
    expect(titles).toContain("Beam over the bed"); // form-school perception kept
    expect(titles).not.toContain("LLM eight-mansions opinion"); // model's verdict dropped
    expect(
      res.analysis.factors.some(
        (f) => f.principle === "八宅" || f.principle === "玄空飞星",
      ),
    ).toBe(true); // engine-computed verdicts present
  });

  it("returns a cached reading verbatim — no model call, no credit charge", async () => {
    const cached = {
      score: 6.4,
      summary: "previously read",
      facing: "South",
      confidence: "high" as const,
      rooms: [],
      factors: [],
      recommendations: [],
    };
    getCachedReading.mockResolvedValue(cached);

    const res = await analyzeFloorPlan(IMG, "South", 2024);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.analysis).toEqual(cached);
    expect(analyzeFloorPlanImage).not.toHaveBeenCalled(); // no vision model
    expect(reserveReading).not.toHaveBeenCalled(); // no credit reserved
  });
});

describe("recomputeReading — deterministic re-read of a confirmed layout", () => {
  it("recomputes the engine for the edited rooms with no model call or credit", async () => {
    const rooms = [
      { name: "Kitchen", sector: "SE" },
      { name: "Bathroom", sector: "SW" },
    ];
    const res = await recomputeReading("South", 2024, rooms);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const det = computeUnitReading("S", 2024, rooms);
    expect(res.score).toBe(det.score);
    expect(res.engine.group).toBe("东四宅");
    expect(analyzeFloorPlanImage).not.toHaveBeenCalled();
    expect(reserveReading).not.toHaveBeenCalled();
  });
});
