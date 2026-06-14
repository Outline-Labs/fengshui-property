import { beforeEach, describe, expect, it, vi } from "vitest";

// The magic-link verify route must survive email-scanner / browser PREFETCH:
// a GET (which bots issue) only renders a confirm page and consumes nothing; the
// POST (a human button press) is what consumes the single-use token and signs in.
class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(to);
    this.name = "RedirectError";
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const readLoginToken = vi.fn((t: string): string | null =>
  t === "valid-token" ? "lead-1" : null,
);
const createSession = vi.fn(async () => {});
vi.mock("@/lib/session", () => ({
  readLoginToken: (t: string) => readLoginToken(t),
  createSession: (...a: unknown[]) => createSession(...a),
}));

const consumeToken = vi.fn(async () => true);
vi.mock("@/lib/used-tokens", () => ({
  consumeToken: (t: string) => consumeToken(t),
}));

const getLead = vi.fn(async () => ({ id: "lead-1" }));
const markEmailVerified = vi.fn(async () => {});
vi.mock("@/lib/leads", () => ({
  getLead: (...a: unknown[]) => getLead(...a),
  markEmailVerified: (...a: unknown[]) => markEmailVerified(...a),
}));

vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => null }));

const { GET, POST } = await import("./route");

const getReq = (token: string) =>
  new Request(
    `https://www.fengshuiai.sg/login/verify?token=${encodeURIComponent(token)}`,
  );
const postReq = (token: string) =>
  new Request("https://www.fengshuiai.sg/login/verify", {
    method: "POST",
    body: new URLSearchParams({ token }),
  });

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof RedirectError) return e.to;
    throw e;
  }
  throw new Error("no redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  readLoginToken.mockImplementation((t: string) =>
    t === "valid-token" ? "lead-1" : null,
  );
  consumeToken.mockResolvedValue(true);
  getLead.mockResolvedValue({ id: "lead-1" });
});

describe("GET /login/verify — idempotent, prefetch-safe", () => {
  it("renders a POST confirm page for a valid token, consuming/signing in NOTHING", async () => {
    const res = await GET(getReq("valid-token"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('method="POST"');
    expect(html).toContain("valid-token");
    // The whole point: a GET (scanner/prefetch) must burn nothing.
    expect(consumeToken).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("redirects to the error page for an invalid token", async () => {
    expect(await redirectOf(() => GET(getReq("bad")))).toBe("/login?error=link");
  });
});

describe("POST /login/verify — consumes once and signs in", () => {
  it("consumes the token, creates the session, marks verified, → /upload", async () => {
    const to = await redirectOf(() => POST(postReq("valid-token")));
    expect(consumeToken).toHaveBeenCalledWith("valid-token");
    expect(createSession).toHaveBeenCalledWith("lead-1");
    expect(markEmailVerified).toHaveBeenCalledWith("lead-1");
    expect(to).toBe("/upload");
  });

  it("rejects a replay (already-consumed token) with no session", async () => {
    consumeToken.mockResolvedValue(false);
    const to = await redirectOf(() => POST(postReq("valid-token")));
    expect(to).toBe("/login?error=link");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid token before consuming", async () => {
    const to = await redirectOf(() => POST(postReq("bad")));
    expect(to).toBe("/login?error=link");
    expect(consumeToken).not.toHaveBeenCalled();
  });

  it("redirects to the error page when the token resolves but the lead is gone", async () => {
    getLead.mockResolvedValue(null);
    const to = await redirectOf(() => POST(postReq("valid-token")));
    expect(to).toBe("/login?error=link");
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("prefetch THEN human click — the regression this fixes", () => {
  it("a GET prefetch leaves the token spendable, so the following POST still signs in", async () => {
    await GET(getReq("valid-token")); // scanner/prefetch
    expect(consumeToken).not.toHaveBeenCalled();

    const to = await redirectOf(() => POST(postReq("valid-token"))); // human
    expect(consumeToken).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith("lead-1");
    expect(to).toBe("/upload");
  });
});
