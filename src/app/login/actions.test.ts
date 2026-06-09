import { beforeEach, describe, expect, it, vi } from "vitest";

// "use server" actions whose observable output is a redirect (which throws in
// Next). We model that with a sentinel error carrying the target path, and mock
// every collaborator so each branch is deterministic.
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

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));

const sendMagicLink = vi.fn(async () => {});
vi.mock("@/lib/auth-email", () => ({
  sendMagicLink: (p: unknown) => sendMagicLink(p),
}));

const getLeadByEmail = vi.fn();
const getLead = vi.fn();
vi.mock("@/lib/leads", () => ({
  getLeadByEmail: (e: string) => getLeadByEmail(e),
  getLead: (id: string) => getLead(id),
}));

const rateLimit = vi.fn(async () => ({ ok: true, count: 1, limit: 5 }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (p: unknown) => rateLimit(p),
  clientIp: () => "1.2.3.4",
}));

const destroySession = vi.fn(async () => {});
const getLeadId = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/session", () => ({
  destroySession: () => destroySession(),
  getLeadId: () => getLeadId(),
}));

vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => null }));

const { consumerLogin, logout, resendVerification } = await import("./actions");

async function targetOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof RedirectError) return e.to;
    throw e;
  }
  throw new Error("action returned without redirecting");
}
function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ ok: true, count: 1, limit: 5 });
});

describe("consumerLogin", () => {
  it("rejects an invalid email and never sends", async () => {
    const to = await targetOf(() => consumerLogin(form({ email: "nope" })));
    expect(to).toBe("/login?error=email");
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it("sends a login link when the email belongs to a lead", async () => {
    getLeadByEmail.mockResolvedValue({ id: "lead-9", email: "a@b.sg" });
    const to = await targetOf(() => consumerLogin(form({ email: "a@b.sg" })));
    expect(to).toBe("/login?sent=1");
    expect(sendMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead-9", kind: "login" }),
    );
  });

  it("reports 'sent' WITHOUT sending when no account exists (no enumeration leak)", async () => {
    getLeadByEmail.mockResolvedValue(null);
    const to = await targetOf(() => consumerLogin(form({ email: "ghost@b.sg" })));
    expect(to).toBe("/login?sent=1");
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it("when rate-limited, still reports 'sent' and does not send or even look up", async () => {
    rateLimit.mockResolvedValue({ ok: false, count: 6, limit: 5 });
    const to = await targetOf(() => consumerLogin(form({ email: "a@b.sg" })));
    expect(to).toBe("/login?sent=1");
    expect(getLeadByEmail).not.toHaveBeenCalled();
    expect(sendMagicLink).not.toHaveBeenCalled();
  });
});

describe("resendVerification", () => {
  it("redirects an unauthenticated visitor to signup", async () => {
    getLeadId.mockResolvedValue(null);
    const to = await targetOf(() => resendVerification());
    expect(to).toBe("/signup?next=/upload");
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it("resends a verify link for a signed-in, unverified lead", async () => {
    getLeadId.mockResolvedValue("lead-1");
    getLead.mockResolvedValue({ id: "lead-1", email: "a@b.sg", emailVerified: 0 });
    const to = await targetOf(() => resendVerification());
    expect(to).toBe("/upload?verify=sent");
    expect(sendMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead-1", kind: "verify" }),
    );
  });

  it("does NOT resend if the lead is already verified", async () => {
    getLeadId.mockResolvedValue("lead-1");
    getLead.mockResolvedValue({ id: "lead-1", email: "a@b.sg", emailVerified: 1 });
    const to = await targetOf(() => resendVerification());
    expect(to).toBe("/upload?verify=sent");
    expect(sendMagicLink).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  it("destroys the session and returns home", async () => {
    const to = await targetOf(() => logout());
    expect(destroySession).toHaveBeenCalledTimes(1);
    expect(to).toBe("/");
  });
});
