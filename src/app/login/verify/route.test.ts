import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(to);
    this.name = "RedirectError";
  }
}
const redirect = vi.fn((to: string): never => {
  throw new RedirectError(to);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

const readLoginToken = vi.fn<(t: string) => string | null>();
const createSession = vi.fn(async () => {});
vi.mock("@/lib/session", () => ({
  readLoginToken: (t: string) => readLoginToken(t),
  createSession: (id: string) => createSession(id),
}));

const getLead = vi.fn();
const markEmailVerified = vi.fn(async () => {});
vi.mock("@/lib/leads", () => ({
  getLead: (id: string) => getLead(id),
  markEmailVerified: (id: string) => markEmailVerified(id),
}));

vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => null }));

const { GET } = await import("./route");

function req(token?: string): Request {
  const u = new URL("https://www.fengshuiai.sg/login/verify");
  if (token !== undefined) u.searchParams.set("token", token);
  return new Request(u);
}
async function targetOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof RedirectError) return e.to;
    throw e;
  }
  throw new Error("handler returned without redirecting");
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /login/verify", () => {
  it("signs in + marks verified + redirects to /upload for a valid token", async () => {
    readLoginToken.mockReturnValue("lead-7");
    getLead.mockResolvedValue({ id: "lead-7", email: "a@b.sg" });
    const to = await targetOf(() => GET(req("good-token")));
    expect(to).toBe("/upload");
    expect(createSession).toHaveBeenCalledWith("lead-7");
    expect(markEmailVerified).toHaveBeenCalledWith("lead-7");
  });

  it("redirects to ?error=link for an invalid/expired token — no session", async () => {
    readLoginToken.mockReturnValue(null);
    const to = await targetOf(() => GET(req("bad")));
    expect(to).toBe("/login?error=link");
    expect(createSession).not.toHaveBeenCalled();
    expect(markEmailVerified).not.toHaveBeenCalled();
  });

  it("redirects to ?error=link when the token resolves but the lead is gone", async () => {
    readLoginToken.mockReturnValue("ghost");
    getLead.mockResolvedValue(null);
    const to = await targetOf(() => GET(req("good-token")));
    expect(to).toBe("/login?error=link");
    expect(createSession).not.toHaveBeenCalled();
  });
});
