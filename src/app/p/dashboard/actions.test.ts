import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// These are "use server" actions whose only observable output is a redirect.
// In Next, redirect() throws a control-flow error (it never returns), so we
// model that here: our mock throws a sentinel Error whose `.message` is the
// exact target path. Each test asserts the path the action tried to navigate
// to — that path *is* the action's contract.
//
// All collaborators (session, agents, wallet, stripe, headers) are mocked so
// every branch is reachable deterministically without a DB or network.
// ---------------------------------------------------------------------------

class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(to);
    this.name = "RedirectError";
  }
}

const redirect = vi.fn((to: string): never => {
  throw new RedirectError(to);
});

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
}));

const getHeader = vi.fn((name: string): string | null =>
  name === "host" ? "partners.fengshuiai.sg" : null,
);
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => getHeader(name) }),
}));

const getAgentId = vi.fn<() => Promise<string | null>>();
const destroyAgentSession = vi.fn<() => Promise<void>>();
vi.mock("@/lib/session", () => ({
  getAgentId: () => getAgentId(),
  destroyAgentSession: () => destroyAgentSession(),
}));

const claimLead = vi.fn();
vi.mock("@/lib/agents", () => ({
  claimLead: (...args: unknown[]) => claimLead(...args),
}));

const creditWallet = vi.fn(async () => ({ deduped: false, balanceCents: 0 }));
vi.mock("@/lib/wallet", () => ({
  creditWallet: (p: unknown) => creditWallet(p),
}));

// Real pack amounts (cents): 1 / 5 / 10 verified leads. We mock so the test
// doesn't depend on Stripe's SDK, but we keep the validation truthful.
const TOPUP_PACKS_CENTS = [8800, 44000, 88000];
const stripe = vi.fn<() => unknown>(() => null);
vi.mock("@/lib/stripe", () => ({
  isValidTopupAmount: (cents: number) => TOPUP_PACKS_CENTS.includes(cents),
  stripe: () => stripe(),
}));

const { claimAction, topUpAction, agentLogout } = await import("./actions");

/** Run an action and return the redirect target it threw on (or null if it
 * returned without redirecting — which would itself be a contract violation). */
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
  getAgentId.mockReset();
  destroyAgentSession.mockReset();
  claimLead.mockReset();
  creditWallet.mockClear();
  stripe.mockReset();
  stripe.mockReturnValue(null);
  getHeader.mockClear();
  delete process.env.STRIPE_SECRET_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// claimAction — turns a claimLead outcome into a navigation. The reason→path
// map is the agent-facing contract: a money problem and an availability
// problem must land on visibly different error states.
// ---------------------------------------------------------------------------
describe("claimAction", () => {
  it("sends an unauthenticated agent to /login without ever attempting a claim", async () => {
    getAgentId.mockResolvedValue(null);

    const to = await targetOf(() => claimAction(form({ leadId: "lead-1" })));

    expect(to).toBe("/login");
    expect(claimLead).not.toHaveBeenCalled();
  });

  it("on success redirects to the claimed lead's detail page", async () => {
    getAgentId.mockResolvedValue("agent-1");
    claimLead.mockResolvedValue({ ok: true });

    const to = await targetOf(() => claimAction(form({ leadId: "lead-42" })));

    expect(claimLead).toHaveBeenCalledWith("agent-1", "lead-42");
    expect(to).toBe("/leads/lead-42");
  });

  it("maps insufficient_funds to ?error=insufficient", async () => {
    getAgentId.mockResolvedValue("agent-1");
    claimLead.mockResolvedValue({ ok: false, reason: "insufficient_funds" });

    const to = await targetOf(() => claimAction(form({ leadId: "lead-1" })));

    expect(to).toBe("/dashboard?error=insufficient");
  });

  it("maps a taken lead to ?error=taken", async () => {
    getAgentId.mockResolvedValue("agent-1");
    claimLead.mockResolvedValue({ ok: false, reason: "taken" });

    const to = await targetOf(() => claimAction(form({ leadId: "lead-1" })));

    expect(to).toBe("/dashboard?error=taken");
  });

  it("maps an unavailable lead to ?error=taken (any non-funds failure is 'taken')", async () => {
    getAgentId.mockResolvedValue("agent-1");
    claimLead.mockResolvedValue({ ok: false, reason: "unavailable" });

    const to = await targetOf(() => claimAction(form({ leadId: "lead-1" })));

    expect(to).toBe("/dashboard?error=taken");
  });

  it("passes the empty string to claimLead when no leadId is supplied (no crash)", async () => {
    getAgentId.mockResolvedValue("agent-1");
    claimLead.mockResolvedValue({ ok: false, reason: "unavailable" });

    const to = await targetOf(() => claimAction(form({})));

    expect(claimLead).toHaveBeenCalledWith("agent-1", "");
    expect(to).toBe("/dashboard?error=taken");
  });
});

// ---------------------------------------------------------------------------
// topUpAction — never trusts the client amount, and fabricates a credit ONLY
// in the offline dev path (no Stripe key AND non-production). Vitest runs with
// NODE_ENV="test", so 'test' !== 'production' makes the dev branch active here;
// the production fail-closed branch is exercised explicitly via vi.stubEnv.
// ---------------------------------------------------------------------------
describe("topUpAction", () => {
  it("sends an unauthenticated agent to /login before touching the amount", async () => {
    getAgentId.mockResolvedValue(null);

    const to = await targetOf(() => topUpAction(form({ amountCents: "8800" })));

    expect(to).toBe("/login");
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("rejects an off-pack amount with ?error=badamount and no credit", async () => {
    getAgentId.mockResolvedValue("agent-1");

    const to = await targetOf(() => topUpAction(form({ amountCents: "9999" })));

    expect(to).toBe("/dashboard?error=badamount");
    expect(creditWallet).not.toHaveBeenCalled();
    expect(stripe).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric amount with ?error=badamount", async () => {
    getAgentId.mockResolvedValue("agent-1");

    const to = await targetOf(() => topUpAction(form({ amountCents: "lots" })));

    expect(to).toBe("/dashboard?error=badamount");
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("dev path: with no Stripe client and a valid pack, credits the wallet with a dev: ref and redirects to ?topup=devcredit", async () => {
    getAgentId.mockResolvedValue("agent-1");
    stripe.mockReturnValue(null);

    const to = await targetOf(() => topUpAction(form({ amountCents: "44000" })));

    expect(to).toBe("/dashboard?topup=devcredit");
    expect(creditWallet).toHaveBeenCalledTimes(1);
    const arg = creditWallet.mock.calls[0][0] as {
      agentId: string;
      amountCents: number;
      ref: string;
      kind: string;
    };
    expect(arg.agentId).toBe("agent-1");
    expect(arg.amountCents).toBe(44000);
    expect(arg.kind).toBe("topup");
    expect(arg.ref).toMatch(/^dev:/);
  });

  it("dev path credits the exact pack amount the agent chose, not a fixed one", async () => {
    getAgentId.mockResolvedValue("agent-1");
    stripe.mockReturnValue(null);

    await targetOf(() => topUpAction(form({ amountCents: "88000" })));

    const arg = creditWallet.mock.calls[0][0] as { amountCents: number };
    expect(arg.amountCents).toBe(88000);
  });

  it("prod fail-closed: no Stripe key in production redirects to ?error=billing_unavailable and never fabricates a credit", async () => {
    // The security-critical guarantee: a misconfigured production (Stripe key
    // missing) must NEVER credit a wallet for free — it fails closed.
    getAgentId.mockResolvedValue("agent-1");
    stripe.mockReturnValue(null);
    vi.stubEnv("NODE_ENV", "production");

    const to = await targetOf(() => topUpAction(form({ amountCents: "8800" })));

    expect(to).toBe("/dashboard?error=billing_unavailable");
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// agentLogout — destroys the session, then returns the agent to /login.
// ---------------------------------------------------------------------------
describe("agentLogout", () => {
  it("destroys the agent session and redirects to /login", async () => {
    destroyAgentSession.mockResolvedValue(undefined);

    const to = await targetOf(() => agentLogout());

    expect(destroyAgentSession).toHaveBeenCalledTimes(1);
    expect(to).toBe("/login");
  });
});
