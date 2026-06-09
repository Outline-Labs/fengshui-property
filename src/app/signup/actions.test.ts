import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// signup is a "use server" action whose only observable output is a redirect
// (redirect() throws in Next). We model that with a sentinel error carrying the
// target path, and mock every collaborator so each branch is deterministic.
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

const rateLimit = vi.fn(async () => ({ ok: true, count: 1, limit: 10 }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
  clientIp: () => "1.2.3.4",
}));

const upsertLead = vi.fn(async () => "lead-1");
vi.mock("@/lib/leads", () => ({ upsertLead: (...a: unknown[]) => upsertLead(...a) }));

const attachReferral = vi.fn(async () => {});
vi.mock("@/lib/credits", () => ({
  attachReferral: (...a: unknown[]) => attachReferral(...a),
}));

const createSession = vi.fn(async () => {});
vi.mock("@/lib/session", () => ({
  createSession: (...a: unknown[]) => createSession(...a),
}));

vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => null }));

const sendMagicLink = vi.fn(async () => {});
vi.mock("@/lib/auth-email", () => ({
  sendMagicLink: (p: unknown) => sendMagicLink(p),
}));

const { signup } = await import("./actions");

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
  rateLimit.mockResolvedValue({ ok: true, count: 1, limit: 10 });
  upsertLead.mockResolvedValue("lead-1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Rate limiting is the new gate: signup is email-only, so it must be throttled
// per IP BEFORE a lead is ever created.
// ---------------------------------------------------------------------------
describe("signup — per-IP rate limit", () => {
  it("blocks over the limit and never creates a lead or session", async () => {
    rateLimit.mockResolvedValue({ ok: false, count: 11, limit: 10 });

    const to = await targetOf(() => signup(form({ email: "a@b.sg" })));

    expect(to).toBe("/signup?error=ratelimited");
    expect(upsertLead).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("preserves next + ref on the rate-limit redirect", async () => {
    rateLimit.mockResolvedValue({ ok: false, count: 11, limit: 10 });

    const to = await targetOf(() =>
      signup(form({ email: "a@b.sg", next: "/upload", ref: "ABC123" })),
    );

    expect(to).toContain("error=ratelimited");
    expect(to).toContain("next=%2Fupload");
    expect(to).toContain("ref=ABC123");
  });

  it("keys the limit on signup:<ip>", async () => {
    await targetOf(() => signup(form({ email: "a@b.sg" })));
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "signup:1.2.3.4" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Within the limit, the existing contract holds.
// ---------------------------------------------------------------------------
describe("signup — within the limit", () => {
  it("rejects an invalid email without creating a lead", async () => {
    const to = await targetOf(() => signup(form({ email: "not-an-email" })));
    expect(to).toBe("/signup?error=email");
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("creates the lead, attaches the referral, starts a session, redirects to next", async () => {
    const to = await targetOf(() =>
      signup(
        form({
          email: "new@test.sg",
          firstName: "Wei",
          lastName: "Tan",
          next: "/upload",
          ref: "XYZ",
        }),
      ),
    );

    expect(upsertLead).toHaveBeenCalledTimes(1);
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@test.sg", name: "Wei Tan" }),
    );
    expect(attachReferral).toHaveBeenCalledWith("lead-1", "XYZ");
    expect(createSession).toHaveBeenCalledWith("lead-1");
    expect(sendMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead-1", kind: "verify" }),
    );
    expect(to).toBe("/upload");
  });

  it("defaults to /upload when no next is supplied", async () => {
    const to = await targetOf(() =>
      signup(form({ email: "new@test.sg", firstName: "Wei", lastName: "Tan" })),
    );
    expect(to).toBe("/upload");
  });
});

// ---------------------------------------------------------------------------
// Name is mandatory and must carry BOTH a first and last name. The form marks
// the fields required, but the action enforces it server-side too.
// ---------------------------------------------------------------------------
describe("signup — name is mandatory (first + last)", () => {
  it("rejects a missing name without creating a lead or session", async () => {
    const to = await targetOf(() => signup(form({ email: "a@b.sg" })));
    expect(to).toBe("/signup?error=name");
    expect(upsertLead).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects when only the first name is supplied", async () => {
    const to = await targetOf(() =>
      signup(form({ email: "a@b.sg", firstName: "Wei" })),
    );
    expect(to).toBe("/signup?error=name");
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only last name", async () => {
    const to = await targetOf(() =>
      signup(form({ email: "a@b.sg", firstName: "Wei", lastName: "   " })),
    );
    expect(to).toBe("/signup?error=name");
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("trims and combines first + last into a single stored name", async () => {
    await targetOf(() =>
      signup(form({ email: "a@b.sg", firstName: " Wei ", lastName: " Tan " })),
    );
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Wei Tan" }),
    );
  });

  it("preserves next + ref on the name-error redirect", async () => {
    const to = await targetOf(() =>
      signup(form({ email: "a@b.sg", next: "/upload", ref: "ABC123" })),
    );
    expect(to).toContain("error=name");
    expect(to).toContain("next=%2Fupload");
    expect(to).toContain("ref=ABC123");
  });
});
