import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route imports the Revolut client + grantReadings at module load. We mock:
//  - @/lib/revolut: verifyWebhookSignature (the security gate), getOrder (the
//    authoritative re-fetch), readingsForPackCents (price→readings), and
//    revolutConfigured (the configured flag) — all driven per-test.
//  - @/lib/credits: grantReadings, spied without touching the DB.
const verifyWebhookSignature = vi.fn();
const getOrder = vi.fn();
const revolutConfigured = vi.fn(() => true);
const readingsForPackCents = vi.fn((cents: number): number | null =>
  cents === 900 ? 5 : cents === 2400 ? 15 : cents === 5600 ? 40 : null,
);
const grantReadings = vi.fn();

vi.mock("@/lib/revolut", () => ({
  verifyWebhookSignature: (p: unknown) => verifyWebhookSignature(p),
  getOrder: (id: string) => getOrder(id),
  revolutConfigured: () => revolutConfigured(),
  readingsForPackCents: (cents: number) => readingsForPackCents(cents),
}));
vi.mock("@/lib/credits", () => ({
  grantReadings: (p: unknown) => grantReadings(p),
}));

// Imported after the mocks are registered so the route binds the mocked deps.
const { POST } = await import("./route");

/** Build a POST Request with optional Revolut webhook headers and a raw body.
 *  `ts` defaults to the current time as a ms-epoch string so fresh-timestamp
 *  tests don't need to specify it explicitly. Pass an explicit value to test
 *  stale / malformed timestamp paths. */
function webhookRequest(
  opts: { sig?: string; ts?: string; body?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.sig !== undefined) headers["revolut-signature"] = opts.sig;
  // Default to now so the timestamp freshness check passes unless overridden.
  headers["revolut-request-timestamp"] =
    opts.ts !== undefined ? opts.ts : String(Date.now());
  return new Request("https://example.com/api/revolut/webhook", {
    method: "POST",
    headers,
    body: opts.body ?? "{}",
  });
}

function orderCompletedBody(
  fields: Record<string, unknown> = {},
): string {
  // The real webhook payload is thin — event + order_id. The lead reference is
  // read from the re-fetched order (merchant_order_data.reference), not here.
  return JSON.stringify({
    event: "ORDER_COMPLETED",
    order_id: "ord_1",
    ...fields,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: configured, signature valid, an order that completed for a real
  // pack. Tests that exercise the failure/ignore paths override these.
  revolutConfigured.mockReturnValue(true);
  verifyWebhookSignature.mockReturnValue(true);
  getOrder.mockResolvedValue({
    id: "ord_1",
    state: "completed",
    amount: 900,
    currency: "SGD",
    merchant_order_data: { reference: "lead-1" },
  });
  grantReadings.mockResolvedValue({ deduped: false, bonusReadings: 5 });
  vi.stubEnv("REVOLUT_WEBHOOK_SECRET", "wsk_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("revolut webhook — request gating", () => {
  it("400s when the revolut-signature header is missing", async () => {
    const res = await POST(webhookRequest({ ts: "1" })); // no sig
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing signature");
    expect(verifyWebhookSignature).not.toHaveBeenCalled();
    expect(grantReadings).not.toHaveBeenCalled();
  });

  it("fails closed (500) when Revolut is unconfigured", async () => {
    revolutConfigured.mockReturnValue(false);
    const res = await POST(webhookRequest({ sig: "v1=x", ts: "1" }));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Revolut not configured");
    expect(verifyWebhookSignature).not.toHaveBeenCalled();
    expect(grantReadings).not.toHaveBeenCalled();
  });

  it("fails closed (500) when the webhook secret is missing", async () => {
    vi.stubEnv("REVOLUT_WEBHOOK_SECRET", "");
    const res = await POST(webhookRequest({ sig: "v1=x", ts: "1" }));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Revolut not configured");
    expect(grantReadings).not.toHaveBeenCalled();
  });
});

describe("revolut webhook — signature verification", () => {
  it("400s and never acts when the signature does not verify", async () => {
    verifyWebhookSignature.mockReturnValue(false);
    const res = await POST(
      webhookRequest({ sig: "v1=bad", ts: "1", body: orderCompletedBody() }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid signature");
    expect(getOrder).not.toHaveBeenCalled();
    expect(grantReadings).not.toHaveBeenCalled();
  });

  it("verifies against the RAW body, signature header, timestamp, and secret", async () => {
    const raw = orderCompletedBody();
    const freshTs = String(Date.now());
    await POST(webhookRequest({ sig: "v1=good", ts: freshTs, body: raw }));
    expect(verifyWebhookSignature).toHaveBeenCalledTimes(1);
    expect(verifyWebhookSignature).toHaveBeenCalledWith({
      rawBody: raw,
      signatureHeader: "v1=good",
      timestamp: freshTs,
      secret: "wsk_test",
    });
  });
});

describe("revolut webhook — ORDER_COMPLETED", () => {
  it("re-fetches the order and grants readings derived from the charged amount", async () => {
    getOrder.mockResolvedValue({
      id: "ord_42",
      state: "completed",
      amount: 2400, // 15-pack
      currency: "SGD",
      merchant_order_data: { reference: "lead-42" },
    });
    const res = await POST(
      webhookRequest({
        sig: "v1=good",
        body: orderCompletedBody({ order_id: "ord_42" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(getOrder).toHaveBeenCalledWith("ord_42");
    expect(grantReadings).toHaveBeenCalledTimes(1);
    expect(grantReadings).toHaveBeenCalledWith({
      leadId: "lead-42",
      amount: 15,
      kind: "purchase",
      ref: "ord_42",
    });
  });

  it("uses the order id as the idempotency ref so a redelivery grants once", async () => {
    await POST(
      webhookRequest({ sig: "v1=good", body: orderCompletedBody() }),
    );
    expect(grantReadings).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "ord_1" }),
    );
  });

  it("derives readings from the AUTHORITATIVE order amount, not the request body", async () => {
    // The webhook body is thin and untrusted; only the re-fetched order amount
    // decides the grant. A body claiming a bigger pack must not matter.
    getOrder.mockResolvedValue({
      id: "ord_1",
      state: "completed",
      amount: 900, // 5-pack — the real charge
      currency: "SGD",
      merchant_order_data: { reference: "lead-1" },
    });
    await POST(
      webhookRequest({
        sig: "v1=good",
        body: orderCompletedBody({ amount: 5600, readings: 40 }),
      }),
    );
    expect(grantReadings).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5 }),
    );
  });

  it("does NOT grant when the order state is not 'completed'", async () => {
    getOrder.mockResolvedValue({
      id: "ord_1",
      state: "authorised",
      amount: 900,
      merchant_order_data: { reference: "lead-1" },
    });
    const res = await POST(
      webhookRequest({ sig: "v1=good", body: orderCompletedBody() }),
    );
    expect(res.status).toBe(200);
    expect(grantReadings).not.toHaveBeenCalled();
  });

  it("does NOT grant when no leadId (merchant_order_data.reference) can be resolved", async () => {
    getOrder.mockResolvedValue({ id: "ord_1", state: "completed", amount: 900, currency: "SGD" });
    const res = await POST(
      webhookRequest({
        sig: "v1=good",
        body: JSON.stringify({ event: "ORDER_COMPLETED", order_id: "ord_1" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(grantReadings).not.toHaveBeenCalled();
  });

  it("does NOT grant when the charged amount maps to no real pack", async () => {
    getOrder.mockResolvedValue({
      id: "ord_1",
      state: "completed",
      amount: 1234, // off-pack
      currency: "SGD",
      merchant_order_data: { reference: "lead-1" },
    });
    const res = await POST(
      webhookRequest({ sig: "v1=good", body: orderCompletedBody() }),
    );
    expect(res.status).toBe(200);
    expect(grantReadings).not.toHaveBeenCalled();
  });
});

describe("revolut webhook — ignored events", () => {
  it("acks (200) and does NOT re-fetch or grant for an unrelated event type", async () => {
    const res = await POST(
      webhookRequest({
        sig: "v1=good",
        body: JSON.stringify({ event: "ORDER_AUTHORISED", order_id: "ord_1" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(getOrder).not.toHaveBeenCalled();
    expect(grantReadings).not.toHaveBeenCalled();
  });

  it("400s on an unparseable body (after a valid signature)", async () => {
    const res = await POST(
      webhookRequest({ sig: "v1=good", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid payload");
    expect(grantReadings).not.toHaveBeenCalled();
  });
});

describe("revolut webhook — handler failures", () => {
  it("500s (so Revolut retries) when grantReadings throws", async () => {
    grantReadings.mockRejectedValue(new Error("DB hiccup"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(
      webhookRequest({ sig: "v1=good", body: orderCompletedBody() }),
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Handler error");
    expect(grantReadings).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});

// ── FIX 1: Replay-attack protection (timestamp freshness) ───────────────────
// Revolut-Request-Timestamp is epoch milliseconds. A captured valid request
// replayed >5 minutes later must be rejected with 400 "Timestamp out of range".
describe("revolut webhook — timestamp freshness (replay protection)", () => {
  it("400s when the timestamp is more than 5 minutes in the past (stale / replayed)", async () => {
    // 10 minutes ago — well outside the 300 000 ms window
    const staleTs = String(Date.now() - 10 * 60 * 1000);
    const res = await POST(
      webhookRequest({ sig: "v1=good", ts: staleTs, body: orderCompletedBody() }),
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Timestamp out of range");
    expect(grantReadings).not.toHaveBeenCalled();
  });

  it("proceeds past the timestamp check when the timestamp is fresh", async () => {
    // Exactly now — well inside the 300 000 ms window
    const freshTs = String(Date.now());
    const res = await POST(
      webhookRequest({ sig: "v1=good", ts: freshTs, body: orderCompletedBody() }),
    );
    // The default beforeEach has a completed SGD order so it proceeds all the
    // way to grantReadings and returns 200.
    expect(res.status).toBe(200);
    expect(grantReadings).toHaveBeenCalledTimes(1);
  });
});

// ── FIX 2: Currency guard ────────────────────────────────────────────────────
// An order not denominated in SGD must be silently acked (200) so Revolut
// stops retrying, but grantReadings must NOT be called — minor-unit amounts
// in a cheaper currency happen to match our SGD pack prices by coincidence.
describe("revolut webhook — currency guard", () => {
  it("does NOT grant when a completed order is denominated in USD (acks 200 so Revolut stops retrying)", async () => {
    getOrder.mockResolvedValue({
      id: "ord_usd_1",
      state: "completed",
      amount: 900, // happens to equal the SGD 5-pack in minor units
      currency: "USD",
      merchant_order_data: { reference: "lead-1" },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(
      webhookRequest({
        sig: "v1=good",
        body: orderCompletedBody({ order_id: "ord_usd_1" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(grantReadings).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unexpected currency USD"),
    );
    warnSpy.mockRestore();
  });

  it("still grants when a completed order is correctly denominated in SGD", async () => {
    getOrder.mockResolvedValue({
      id: "ord_sgd_1",
      state: "completed",
      amount: 900, // 5-pack in SGD
      currency: "SGD",
      merchant_order_data: { reference: "lead-1" },
    });
    const res = await POST(
      webhookRequest({
        sig: "v1=good",
        body: orderCompletedBody({ order_id: "ord_sgd_1" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(grantReadings).toHaveBeenCalledTimes(1);
    expect(grantReadings).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5, ref: "ord_sgd_1" }),
    );
  });
});
