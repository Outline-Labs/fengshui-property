import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  READING_PACKS,
  TOPUP_PACKS_CENTS,
  createOrder,
  getOrder,
  isValidTopupAmount,
  readingsForPackCents,
  verifyWebhookSignature,
} from "./revolut";

describe("TOPUP_PACKS_CENTS shape", () => {
  it("is exactly the 1 / 5 / 10 lead packs at S$88/lead, in cents", () => {
    expect(TOPUP_PACKS_CENTS).toEqual([8800, 44000, 88000]);
  });
});

describe("isValidTopupAmount", () => {
  it("is true for every defined top-up pack", () => {
    for (const cents of TOPUP_PACKS_CENTS) {
      expect(isValidTopupAmount(cents)).toBe(true);
    }
  });

  it("is false for zero, negatives, NaN, and off-pack amounts", () => {
    expect(isValidTopupAmount(0)).toBe(false);
    expect(isValidTopupAmount(-8800)).toBe(false);
    expect(isValidTopupAmount(Number.NaN)).toBe(false);
    expect(isValidTopupAmount(8801)).toBe(false);
    expect(isValidTopupAmount(100)).toBe(false);
  });
});

describe("READING_PACKS / readingsForPackCents", () => {
  it("maps each pack's exact price to its reading count and nothing else", () => {
    for (const p of READING_PACKS) {
      expect(readingsForPackCents(p.cents)).toBe(p.readings);
    }
    // A tampered or unknown amount buys nothing — the webhook re-derives from
    // this, so an off-pack charge must never mint credits.
    expect(readingsForPackCents(901)).toBeNull();
    expect(readingsForPackCents(0)).toBeNull();
    expect(readingsForPackCents(99999)).toBeNull();
  });
});

describe("revolutConfigured() / revolutApiBase() — env gating", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports unconfigured when REVOLUT_SECRET_KEY is unset", async () => {
    vi.stubEnv("REVOLUT_SECRET_KEY", "");
    delete process.env.REVOLUT_SECRET_KEY;
    const mod = await import("./revolut");
    expect(mod.revolutConfigured()).toBe(false);
  });

  it("reports configured when the key is set", async () => {
    vi.stubEnv("REVOLUT_SECRET_KEY", "sk_test_dummy");
    const mod = await import("./revolut");
    expect(mod.revolutConfigured()).toBe(true);
  });

  it("defaults to the SANDBOX base when REVOLUT_ENV is unset (fail safe)", async () => {
    delete process.env.REVOLUT_ENV;
    const mod = await import("./revolut");
    expect(mod.revolutApiBase()).toBe("https://sandbox-merchant.revolut.com");
  });

  it("uses the SANDBOX base for any non-live REVOLUT_ENV value", async () => {
    vi.stubEnv("REVOLUT_ENV", "sandbox");
    const mod = await import("./revolut");
    expect(mod.revolutApiBase()).toBe("https://sandbox-merchant.revolut.com");
  });

  it("uses the PRODUCTION base only when REVOLUT_ENV explicitly names live", async () => {
    vi.stubEnv("REVOLUT_ENV", "production");
    const mod = await import("./revolut");
    expect(mod.revolutApiBase()).toBe("https://merchant.revolut.com");
  });
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature is the security gate on the webhook: only a payload
// signed with our endpoint secret may move money. Revolut signs
//   "v1." + timestamp + "." + rawBody   →  HMAC-SHA256  →  "v1=<hex>".
// ---------------------------------------------------------------------------
describe("verifyWebhookSignature", () => {
  const secret = "wsk_test_secret";
  const timestamp = "1717689600000";
  const rawBody = '{"event":"ORDER_COMPLETED","order_id":"abc"}';

  function sign(s: string, ts: string, body: string): string {
    return (
      "v1=" +
      crypto.createHmac("sha256", s).update(`v1.${ts}.${body}`).digest("hex")
    );
  }

  it("accepts a correctly signed payload", () => {
    const signatureHeader = sign(secret, timestamp, rawBody);
    expect(
      verifyWebhookSignature({ rawBody, signatureHeader, timestamp, secret }),
    ).toBe(true);
  });

  it("accepts when the header carries multiple signatures and one matches (rotation)", () => {
    const good = sign(secret, timestamp, rawBody);
    const stale = sign("old_secret", timestamp, rawBody);
    expect(
      verifyWebhookSignature({
        rawBody,
        signatureHeader: `${stale} ${good}`,
        timestamp,
        secret,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signatureHeader = sign(secret, timestamp, rawBody);
    expect(
      verifyWebhookSignature({
        rawBody: rawBody.replace("abc", "evil"),
        signatureHeader,
        timestamp,
        secret,
      }),
    ).toBe(false);
  });

  it("rejects a wrong secret, a wrong timestamp, and missing inputs", () => {
    const signatureHeader = sign(secret, timestamp, rawBody);
    expect(
      verifyWebhookSignature({
        rawBody,
        signatureHeader,
        timestamp,
        secret: "not_the_secret",
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        rawBody,
        signatureHeader,
        timestamp: "0",
        secret,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        rawBody,
        signatureHeader: null,
        timestamp,
        secret,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        rawBody,
        signatureHeader,
        timestamp: null,
        secret,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        rawBody,
        signatureHeader,
        timestamp,
        secret: undefined,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createOrder / getOrder request contract. fetch is mocked so we assert the
// EXACT request the 2024-09-01 Merchant API expects — the shape verified live
// against the sandbox. This locks the two things mocked unit tests can't infer
// and that the sandbox actually enforces: capture_mode must be lowercase
// "automatic", and our reference rides in merchant_order_data.reference (NOT
// the legacy top-level merchant_order_ext_ref).
// ---------------------------------------------------------------------------
describe("createOrder / getOrder — request contract", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("REVOLUT_SECRET_KEY", "sk_test_contract");
    vi.stubEnv("REVOLUT_ENV", "sandbox");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function ok(body: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }

  it("createOrder POSTs the exact body the sandbox accepts", async () => {
    fetchMock.mockResolvedValue(
      ok({ id: "ord_1", state: "pending", checkout_url: "https://pay" }),
    );

    const order = await createOrder({
      amountCents: 900,
      currency: "sgd",
      extRef: "lead-42",
      redirectUrl: "https://www.fengshuiai.sg/upload?credits=done",
      description: "5 reading credits",
    });

    expect(order.checkout_url).toBe("https://pay");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://sandbox-merchant.revolut.com/api/orders");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk_test_contract");
    expect(init.headers["Revolut-Api-Version"]).toBe("2024-09-01");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 900,
      currency: "SGD", // normalised to upper case
      capture_mode: "automatic", // lowercase — the API rejects "AUTOMATIC"
      merchant_order_data: { reference: "lead-42" }, // NOT merchant_order_ext_ref
      redirect_url: "https://www.fengshuiai.sg/upload?credits=done",
      description: "5 reading credits",
    });
  });

  it("createOrder throws on a non-2xx response (so the action fails closed)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"message":"bad"}',
    });
    await expect(
      createOrder({ amountCents: 900, extRef: "x", redirectUrl: "https://r" }),
    ).rejects.toThrow(/Revolut createOrder 400/);
  });

  it("getOrder GETs the order by id with auth + version headers", async () => {
    fetchMock.mockResolvedValue(
      ok({
        id: "ord_9",
        state: "completed",
        amount: 900,
        merchant_order_data: { reference: "lead-9" },
      }),
    );
    const order = await getOrder("ord_9");
    expect(order.merchant_order_data?.reference).toBe("lead-9");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://sandbox-merchant.revolut.com/api/orders/ord_9");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer sk_test_contract");
    expect(init.headers["Revolut-Api-Version"]).toBe("2024-09-01");
  });

  it("getOrder throws on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    });
    await expect(getOrder("nope")).rejects.toThrow(/Revolut getOrder 404/);
  });
});
