import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route imports stripe() and creditWallet() at module load. We mock both:
//  - @/lib/stripe lets us flip stripe() between null (unconfigured) and a fake
//    client whose webhooks.constructEvent we drive per-test.
//  - @/lib/wallet lets us spy on creditWallet without touching the DB.
// constructEvent and creditWallet are fresh vi.fn()s reset in beforeEach, so
// each test programs its own behaviour.
const constructEvent = vi.fn();
const stripe = vi.fn();
const creditWallet = vi.fn();

vi.mock("@/lib/stripe", () => ({ stripe }));
vi.mock("@/lib/wallet", () => ({ creditWallet }));

// Imported after the mocks are registered so the route binds the mocked deps.
const { POST } = await import("./route");

/** A fake Stripe client exposing only the surface the route touches. */
function fakeStripeClient() {
  return { webhooks: { constructEvent } };
}

/** Build a POST Request with an optional stripe-signature header and raw body. */
function webhookRequest(opts: { sig?: string; body?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.sig !== undefined) headers["stripe-signature"] = opts.sig;
  return new Request("https://example.com/api/stripe/webhook", {
    method: "POST",
    headers,
    body: opts.body ?? "{}",
  });
}

/** A checkout.session.completed event with overridable session fields. */
function checkoutCompletedEvent(
  session: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        payment_status: "paid",
        metadata: { agentId: "agent-1", topupCents: "8800" },
        ...session,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: Stripe is configured (client + secret) and credits succeed. Tests
  // that exercise the unconfigured / failure paths override these.
  stripe.mockReturnValue(fakeStripeClient());
  creditWallet.mockResolvedValue({ deduped: false, balanceCents: 8800 });
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stripe webhook — request gating", () => {
  it("400s when the stripe-signature header is missing", async () => {
    const res = await POST(webhookRequest({})); // no sig header
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing signature");
    // Must short-circuit before verifying or crediting anything.
    expect(constructEvent).not.toHaveBeenCalled();
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("fails closed (500) when stripe() is null even though a signature is present", async () => {
    stripe.mockReturnValue(null);
    const res = await POST(webhookRequest({ sig: "sig_present" }));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Stripe not configured");
    expect(constructEvent).not.toHaveBeenCalled();
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("fails closed (500) when the webhook secret is missing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await POST(webhookRequest({ sig: "sig_present" }));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Stripe not configured");
    expect(constructEvent).not.toHaveBeenCalled();
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

describe("stripe webhook — signature verification", () => {
  it("400s when constructEvent throws (bad/forged signature)", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    const res = await POST(webhookRequest({ sig: "bad_sig", body: "{}" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid signature");
    // Never act on an event that didn't verify.
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("verifies against the RAW body, signature, and secret (no re-parse)", async () => {
    const raw = JSON.stringify({ type: "irrelevant" });
    constructEvent.mockReturnValue({ type: "irrelevant" });
    const res = await POST(webhookRequest({ sig: "good_sig", body: raw }));
    expect(res.status).toBe(200);
    expect(constructEvent).toHaveBeenCalledTimes(1);
    expect(constructEvent).toHaveBeenCalledWith(raw, "good_sig", "whsec_test");
  });
});

describe("stripe webhook — checkout.session.completed", () => {
  it("credits the wallet and returns 200 for a paid session", async () => {
    constructEvent.mockReturnValue(
      checkoutCompletedEvent({
        id: "cs_paid_1",
        payment_status: "paid",
        metadata: { agentId: "agent-42", topupCents: "44000" },
      }),
    );
    const res = await POST(webhookRequest({ sig: "good_sig" }));
    expect(res.status).toBe(200);
    expect(creditWallet).toHaveBeenCalledTimes(1);
    expect(creditWallet).toHaveBeenCalledWith({
      agentId: "agent-42",
      amountCents: 44000,
      ref: "cs_paid_1",
      kind: "topup",
    });
  });

  it("uses the session id as the idempotency ref so a redelivery credits once", async () => {
    const event = checkoutCompletedEvent({ id: "cs_unique_ref" });
    constructEvent.mockReturnValue(event);
    await POST(webhookRequest({ sig: "good_sig" }));
    expect(creditWallet).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "cs_unique_ref" }),
    );
  });

  it("does NOT credit when payment_status is not 'paid' (e.g. 'unpaid')", async () => {
    constructEvent.mockReturnValue(
      checkoutCompletedEvent({ payment_status: "unpaid" }),
    );
    const res = await POST(webhookRequest({ sig: "good_sig" }));
    expect(res.status).toBe(200);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("does NOT credit when agentId metadata is missing", async () => {
    constructEvent.mockReturnValue(
      checkoutCompletedEvent({ metadata: { topupCents: "8800" } }),
    );
    const res = await POST(webhookRequest({ sig: "good_sig" }));
    expect(res.status).toBe(200);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("does NOT credit when topupCents is missing or zero", async () => {
    constructEvent.mockReturnValue(
      checkoutCompletedEvent({ metadata: { agentId: "agent-1" } }),
    );
    const res = await POST(webhookRequest({ sig: "good_sig" }));
    expect(res.status).toBe(200);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("does NOT credit when topupCents is non-positive", async () => {
    constructEvent.mockReturnValue(
      checkoutCompletedEvent({
        metadata: { agentId: "agent-1", topupCents: "-100" },
      }),
    );
    const res = await POST(webhookRequest({ sig: "good_sig" }));
    expect(res.status).toBe(200);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("does NOT credit when topupCents is non-integer", async () => {
    constructEvent.mockReturnValue(
      checkoutCompletedEvent({
        metadata: { agentId: "agent-1", topupCents: "12.5" },
      }),
    );
    const res = await POST(webhookRequest({ sig: "good_sig" }));
    expect(res.status).toBe(200);
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

describe("stripe webhook — ignored event types", () => {
  it("acks (200) and does NOT credit for an unrelated event type", async () => {
    constructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: {} },
    });
    const res = await POST(webhookRequest({ sig: "good_sig" }));
    expect(res.status).toBe(200);
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

describe("stripe webhook — handler failures", () => {
  it("500s (so Stripe retries) when creditWallet throws", async () => {
    constructEvent.mockReturnValue(checkoutCompletedEvent());
    creditWallet.mockRejectedValue(new Error("DB hiccup"));
    // Silence the route's console.error for a clean test log.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(webhookRequest({ sig: "good_sig" }));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Handler error");
    expect(creditWallet).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
