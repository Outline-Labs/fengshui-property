import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

const CONSUMER = "fengshuiai.sg";
const PARTNER = "partners.fengshuiai.sg";

function req(host: string, path: string): NextRequest {
  return new NextRequest(new URL(`https://${host}${path}`), {
    headers: { host },
  });
}

/** The pathname a NextResponse.rewrite() points at, or null if not a rewrite. */
function rewriteTarget(res: ReturnType<typeof proxy>): string | null {
  const h = res.headers.get("x-middleware-rewrite");
  return h ? new URL(h).pathname : null;
}

describe("proxy — maintenance mode (MAINTENANCE_MODE)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves a 503 holding page for any route, short-circuiting host routing", () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    const res = proxy(req(CONSUMER, "/upload"));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("3600");
    // applies to the partner host too (runs before any routing)
    expect(proxy(req(PARTNER, "/dashboard")).status).toBe(503);
  });

  it("does NOT intercept when MAINTENANCE_MODE is unset or false", () => {
    expect(proxy(req(CONSUMER, "/")).status).not.toBe(503);
    vi.stubEnv("MAINTENANCE_MODE", "false");
    expect(proxy(req(CONSUMER, "/")).status).not.toBe(503);
  });
});

describe("proxy — partner host routing", () => {
  it("rewrites clean partner URLs onto /p and marks them noindex", () => {
    const res = proxy(req(PARTNER, "/dashboard"));
    expect(rewriteTarget(res)).toBe("/p/dashboard");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("rewrites the partner root to /p", () => {
    expect(rewriteTarget(proxy(req(PARTNER, "/")))).toBe("/p");
  });

  it("does not double-prefix an already-/p path but still noindexes it", () => {
    const res = proxy(req(PARTNER, "/p/export"));
    expect(rewriteTarget(res)).toBeNull(); // no rewrite
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("proxy — consumer host in PRODUCTION", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));
  afterEach(() => vi.unstubAllEnvs());

  it("404s the partner surface so the funnel can't leak", () => {
    expect(proxy(req(CONSUMER, "/p/dashboard")).status).toBe(404);
    expect(proxy(req(CONSUMER, "/p")).status).toBe(404);
  });

  // Regression guard for the shipped bug: these public pages start with "p"
  // but must NOT be treated as the partner surface.
  it("serves public pages whose path merely starts with 'p'", () => {
    for (const path of ["/privacy", "/period-9", "/pdpa"]) {
      const res = proxy(req(CONSUMER, path));
      expect(res.status, `${path} should not 404`).not.toBe(404);
      expect(rewriteTarget(res), `${path} should not rewrite`).toBeNull();
    }
  });

  it("does not add noindex to consumer pages", () => {
    expect(proxy(req(CONSUMER, "/")).headers.get("x-robots-tag")).toBeNull();
  });
});

describe("proxy — consumer host in DEVELOPMENT", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "development"));
  afterEach(() => vi.unstubAllEnvs());

  it("does not 404 /p in dev (so partners.localhost can be tested)", () => {
    expect(proxy(req(CONSUMER, "/p/dashboard")).status).not.toBe(404);
  });
});

// The consumer-only first release: the agent surface is OFF. Triggered by
// production (the default posture) OR an explicit PARTNERS_ENABLED=false.
describe("proxy — partner surface DISABLED (consumer-only launch)", () => {
  describe.each([
    ["production default", () => vi.stubEnv("NODE_ENV", "production")],
    ["explicit PARTNERS_ENABLED=false", () => vi.stubEnv("PARTNERS_ENABLED", "false")],
  ])("%s", (_label, setup) => {
    beforeEach(setup);
    afterEach(() => vi.unstubAllEnvs());

    it("404s every /p path, on either host", () => {
      expect(proxy(req(PARTNER, "/p/dashboard")).status).toBe(404);
      expect(proxy(req(CONSUMER, "/p/dashboard")).status).toBe(404);
      expect(proxy(req(PARTNER, "/p")).status).toBe(404);
    });

    it("does NOT route the partner host to /p (no rewrite, no noindex)", () => {
      const res = proxy(req(PARTNER, "/dashboard"));
      expect(rewriteTarget(res)).toBeNull();
      expect(res.headers.get("x-robots-tag")).toBeNull();
    });

    it("still serves the consumer site normally", () => {
      const res = proxy(req(CONSUMER, "/"));
      expect(res.status).not.toBe(404);
      expect(rewriteTarget(res)).toBeNull();
    });
  });
});

// Escape hatch: PARTNERS_ENABLED=true re-enables the surface even in production
// (e.g. a staging deploy that needs the dashboard).
describe("proxy — PARTNERS_ENABLED=true overrides production", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PARTNERS_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("routes the partner host even in production", () => {
    const res = proxy(req(PARTNER, "/dashboard"));
    expect(rewriteTarget(res)).toBe("/p/dashboard");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
