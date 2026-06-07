import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, ensureSchema } from "@/lib/db";
import { analyses, leads, readingGrants } from "@/lib/db/schema";
import { getCredits, upsertLead } from "@/lib/leads";

// End-to-end money movement: the REAL route, REAL signature verification, REAL
// grantReadings, and the REAL (test) DB. Only the outbound network call to
// Revolut (getOrder) is mocked — it stands in for Revolut's authoritative order
// lookup. This proves the full paid-webhook wiring that the unit test (which
// mocks verify + grant) deliberately doesn't: HMAC gate → parse → re-fetch →
// DB credit → idempotency, exactly as a real "test payment" would drive it.
const getOrder = vi.fn();
vi.mock("@/lib/revolut", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/revolut")>();
  return { ...actual, getOrder: (id: string) => getOrder(id) };
});
// No PostHog in tests — keep the handler off the network deterministically.
vi.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => null }));

const SECRET = "wsk_integration_secret";
const { POST } = await import("./route");

function signedRequest(rawBody: string, ts = "1717689600000"): Request {
  const sig =
    "v1=" +
    crypto
      .createHmac("sha256", SECRET)
      .update(`v1.${ts}.${rawBody}`)
      .digest("hex");
  return new Request("https://example.com/api/revolut/webhook", {
    method: "POST",
    headers: {
      "revolut-signature": sig,
      "revolut-request-timestamp": ts,
    },
    body: rawBody,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await ensureSchema();
  await db.delete(readingGrants);
  await db.delete(analyses);
  await db.delete(leads);
  vi.stubEnv("REVOLUT_SECRET_KEY", "sk_test_integration");
  vi.stubEnv("REVOLUT_WEBHOOK_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("revolut webhook — real money movement", () => {
  it("a correctly-signed ORDER_COMPLETED actually credits the lead's readings", async () => {
    const leadId = await upsertLead({ email: "buyer@test.sg" });
    getOrder.mockResolvedValue({
      id: "ord_real_1",
      state: "completed",
      amount: 2400, // 15-pack
      currency: "SGD",
      merchant_order_data: { reference: leadId },
    });

    // Thin payload — the lead reference comes from the re-fetched order, not here.
    const body = JSON.stringify({
      event: "ORDER_COMPLETED",
      order_id: "ord_real_1",
    });
    const res = await POST(signedRequest(body));

    expect(res.status).toBe(200);
    expect(getOrder).toHaveBeenCalledWith("ord_real_1");
    const credits = await getCredits(leadId);
    expect(credits.bonusReadings).toBe(15);
  });

  it("is idempotent: a redelivered identical event credits exactly once", async () => {
    const leadId = await upsertLead({ email: "dupe@test.sg" });
    getOrder.mockResolvedValue({
      id: "ord_real_2",
      state: "completed",
      amount: 900, // 5-pack
      merchant_order_data: { reference: leadId },
    });
    const body = JSON.stringify({
      event: "ORDER_COMPLETED",
      order_id: "ord_real_2",
    });

    expect((await POST(signedRequest(body))).status).toBe(200);
    expect((await POST(signedRequest(body))).status).toBe(200); // redelivery

    expect((await getCredits(leadId)).bonusReadings).toBe(5); // not 10
    const rows = await db.select().from(readingGrants);
    expect(rows.filter((r) => r.ref === "ord_real_2")).toHaveLength(1);
  });

  it("a forged signature is rejected (400) and moves no money", async () => {
    const leadId = await upsertLead({ email: "forge@test.sg" });
    getOrder.mockResolvedValue({
      id: "x",
      state: "completed",
      amount: 900,
      merchant_order_data: { reference: leadId },
    });
    const req = new Request("https://example.com/api/revolut/webhook", {
      method: "POST",
      headers: {
        "revolut-signature": "v1=deadbeef",
        "revolut-request-timestamp": "1717689600000",
      },
      body: JSON.stringify({ event: "ORDER_COMPLETED", order_id: "x" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(getOrder).not.toHaveBeenCalled();
    expect((await getCredits(leadId)).bonusReadings).toBe(0);
  });

  it("an uncompleted order (authorised, not completed) credits nothing", async () => {
    const leadId = await upsertLead({ email: "pending@test.sg" });
    getOrder.mockResolvedValue({
      id: "ord_pending",
      state: "authorised",
      amount: 900,
      merchant_order_data: { reference: leadId },
    });
    const res = await POST(
      signedRequest(
        JSON.stringify({ event: "ORDER_COMPLETED", order_id: "ord_pending" }),
      ),
    );

    expect(res.status).toBe(200);
    expect((await getCredits(leadId)).bonusReadings).toBe(0);
  });

  it("an off-pack charge amount credits nothing (anti-tamper)", async () => {
    const leadId = await upsertLead({ email: "offpack@test.sg" });
    getOrder.mockResolvedValue({
      id: "ord_offpack",
      state: "completed",
      amount: 1234, // not a real pack price
      merchant_order_data: { reference: leadId },
    });
    const res = await POST(
      signedRequest(
        JSON.stringify({ event: "ORDER_COMPLETED", order_id: "ord_offpack" }),
      ),
    );

    expect(res.status).toBe(200);
    expect((await getCredits(leadId)).bonusReadings).toBe(0);
  });
});
