import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// buyReadingsAction is a "use server" action whose only observable output is a
// redirect. redirect() throws in Next (never returns), so we model it as a
// sentinel error carrying the target path — that path IS the contract. Every
// collaborator (session, credits, revolut, headers, posthog) is mocked so each
// branch is reachable without a DB or network.
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

const getHeader = vi.fn((name: string): string | null =>
  name === "host" ? "fengshuiai.sg" : null,
);
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => getHeader(name) }),
}));

const getLeadId = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/session", () => ({ getLeadId: () => getLeadId() }));

const grantReadings = vi.fn(async () => ({ deduped: false, bonusReadings: 0 }));
vi.mock("@/lib/credits", () => ({
  grantReadings: (p: unknown) => grantReadings(p),
}));

const revolutConfigured = vi.fn(() => false);
const createOrder = vi.fn();
vi.mock("@/lib/revolut", () => ({
  revolutConfigured: () => revolutConfigured(),
  createOrder: (p: unknown) => createOrder(p),
  readingsForPackCents: (cents: number): number | null =>
    cents === 900 ? 5 : cents === 2400 ? 15 : cents === 5600 ? 40 : null,
}));

// No PostHog token in tests → getPostHogClient returns null and the capture
// block is skipped, but mock it anyway so the route never reaches the network.
vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => null }));

const { buyReadingsAction } = await import("./credits-actions");

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
  redirect.mockClear();
  getHeader.mockClear();
  getLeadId.mockReset();
  grantReadings.mockClear();
  revolutConfigured.mockReset();
  revolutConfigured.mockReturnValue(false);
  createOrder.mockReset();
  delete process.env.NODE_ENV;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buyReadingsAction — gating", () => {
  it("sends an unauthenticated visitor to signup and never charges", async () => {
    getLeadId.mockResolvedValue(null);
    const to = await targetOf(() => buyReadingsAction(form({ cents: "900" })));
    expect(to).toBe("/signup?next=/upload");
    expect(createOrder).not.toHaveBeenCalled();
    expect(grantReadings).not.toHaveBeenCalled();
  });

  it("rejects an off-pack price with ?error=badpack and no charge", async () => {
    getLeadId.mockResolvedValue("lead-1");
    const to = await targetOf(() => buyReadingsAction(form({ cents: "901" })));
    expect(to).toBe("/upload?error=badpack");
    expect(createOrder).not.toHaveBeenCalled();
    expect(grantReadings).not.toHaveBeenCalled();
  });
});

describe("buyReadingsAction — no Revolut keys", () => {
  it("dev path: grants the pack instantly with a dev: ref and lands on ?credits=devcredit", async () => {
    getLeadId.mockResolvedValue("lead-1");
    revolutConfigured.mockReturnValue(false); // non-prod (NODE_ENV unset)
    const to = await targetOf(() => buyReadingsAction(form({ cents: "2400" })));
    expect(to).toBe("/upload?credits=devcredit");
    expect(createOrder).not.toHaveBeenCalled();
    expect(grantReadings).toHaveBeenCalledTimes(1);
    const arg = grantReadings.mock.calls[0][0] as {
      leadId: string;
      amount: number;
      kind: string;
      ref: string;
    };
    expect(arg.leadId).toBe("lead-1");
    expect(arg.amount).toBe(15); // 2400c → 15-pack, derived server-side
    expect(arg.kind).toBe("purchase");
    expect(arg.ref).toMatch(/^dev:/);
  });

  it("prod fail-closed: never fabricates credit, lands on ?error=billing_unavailable", async () => {
    getLeadId.mockResolvedValue("lead-1");
    revolutConfigured.mockReturnValue(false);
    vi.stubEnv("NODE_ENV", "production");
    const to = await targetOf(() => buyReadingsAction(form({ cents: "900" })));
    expect(to).toBe("/upload?error=billing_unavailable");
    expect(grantReadings).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });
});

describe("buyReadingsAction — Revolut configured", () => {
  it("creates a hosted order for the validated pack and redirects to its checkout_url", async () => {
    getLeadId.mockResolvedValue("lead-7");
    revolutConfigured.mockReturnValue(true);
    createOrder.mockResolvedValue({
      id: "ord_7",
      state: "pending",
      checkout_url: "https://checkout.revolut.com/pay/ord_7",
    });

    const to = await targetOf(() => buyReadingsAction(form({ cents: "5600" })));

    expect(to).toBe("https://checkout.revolut.com/pay/ord_7");
    expect(grantReadings).not.toHaveBeenCalled(); // credit comes from the webhook
    expect(createOrder).toHaveBeenCalledTimes(1);
    const arg = createOrder.mock.calls[0][0] as {
      amountCents: number;
      currency: string;
      extRef: string;
      redirectUrl: string;
    };
    expect(arg.amountCents).toBe(5600);
    expect(arg.currency).toBe("SGD");
    expect(arg.extRef).toBe("lead-7"); // carries the lead for the webhook
    expect(arg.redirectUrl).toMatch(/\/upload\?credits=done$/);
  });

  it("fails closed if the order has no checkout_url", async () => {
    getLeadId.mockResolvedValue("lead-7");
    revolutConfigured.mockReturnValue(true);
    createOrder.mockResolvedValue({ id: "ord_x", state: "pending" });

    const to = await targetOf(() => buyReadingsAction(form({ cents: "900" })));
    expect(to).toBe("/upload?error=billing_unavailable");
  });
});
