import { beforeEach, describe, expect, it, vi } from "vitest";

// submitLead is the /map email gate. It must NEVER mint a session (typing an
// email must not authenticate you as that lead) — it emails a one-time link
// instead: login for an existing account (without touching its data), verify
// for a brand-new lead.

const upsertLead = vi.fn(async () => "new-lead");
const getLeadByEmail = vi.fn(async (): Promise<{ id: string } | null> => null);
vi.mock("@/lib/leads", () => ({
  upsertLead: (...a: unknown[]) => upsertLead(...a),
  getLeadByEmail: (...a: unknown[]) => getLeadByEmail(...a),
}));

const sendMagicLink = vi.fn(async () => {});
vi.mock("@/lib/auth-email", () => ({
  sendMagicLink: (p: unknown) => sendMagicLink(p),
}));

const rateLimit = vi.fn(async () => ({ ok: true, count: 1, limit: 10 }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
  clientIp: () => "1.2.3.4",
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

// Imported by the module but unused by submitLead — stub so the import is inert.
vi.mock("@/lib/onemap", () => ({
  searchAddress: vi.fn(),
  reverseGeocode: vi.fn(),
  formatRevGeocodeAddress: vi.fn(),
}));
vi.mock("@/lib/fengshui/form-school", () => ({ analyzeFormSchool: vi.fn() }));

const { submitLead } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ ok: true, count: 1, limit: 10 });
  getLeadByEmail.mockResolvedValue(null);
  upsertLead.mockResolvedValue("new-lead");
});

describe("map submitLead — never mints a session", () => {
  it("rejects an invalid email without touching anything", async () => {
    const r = await submitLead("not-an-email");
    expect(r.ok).toBe(false);
    expect(sendMagicLink).not.toHaveBeenCalled();
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("rate-limits per IP (no email sent over the limit)", async () => {
    rateLimit.mockResolvedValue({ ok: false, count: 11, limit: 10 });
    const r = await submitLead("a@b.sg");
    expect(r.ok).toBe(false);
    expect(sendMagicLink).not.toHaveBeenCalled();
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("for a NEW email: creates the lead and sends a VERIFY link", async () => {
    getLeadByEmail.mockResolvedValue(null);
    const r = await submitLead("New@Test.SG");
    expect(r.ok).toBe(true);
    expect(upsertLead).toHaveBeenCalledWith({ email: "new@test.sg" });
    expect(sendMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@test.sg",
        leadId: "new-lead",
        kind: "verify",
      }),
    );
  });

  it("for an EXISTING email: sends a LOGIN link and never upserts (no takeover)", async () => {
    getLeadByEmail.mockResolvedValue({ id: "existing-1" });
    const r = await submitLead("owner@test.sg");
    expect(r.ok).toBe(true);
    expect(upsertLead).not.toHaveBeenCalled(); // never touch the existing lead
    expect(sendMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "existing-1", kind: "login" }),
    );
  });
});
