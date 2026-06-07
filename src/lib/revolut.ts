import "server-only";

import crypto from "node:crypto";

// ── Tunable economics (processor-agnostic) ─────────────────────────────────
// Fixed agent top-up packs (cents) — the single source of truth for the
// dashboard buttons AND the server-side amount validation. One verified lead =
// S$88, so the packs are 1 / 5 / 10 leads. Change here to change everywhere.
export const TOPUP_PACKS_CENTS = [8800, 44000, 88000] as const;

export function isValidTopupAmount(cents: number): boolean {
  return (TOPUP_PACKS_CENTS as readonly number[]).includes(cents);
}

// Consumer reading-credit packs — the single source of truth for the buy
// buttons AND the server-side amount→readings mapping (never trust a client
// "readings" count; derive it from the validated price). Prices are a product
// knob, tune freely. cents are SGD.
export type ReadingPack = { readings: number; cents: number; label: string };
export const READING_PACKS: readonly ReadingPack[] = [
  { readings: 5, cents: 900, label: "Starter" },
  { readings: 15, cents: 2400, label: "Plus" },
  { readings: 40, cents: 5600, label: "Pro" },
] as const;

/** Map a paid amount back to the readings it buys; null if it's not a real pack. */
export function readingsForPackCents(cents: number): number | null {
  return READING_PACKS.find((p) => p.cents === cents)?.readings ?? null;
}

// ── Revolut Merchant API client ────────────────────────────────────────────
// The Merchant API is plain REST (no official Node SDK), so we call it with
// fetch. The secret key (sk_…) authorises server-side calls; the dated API
// version is pinned so a Revolut-side change can't silently alter behaviour —
// the analog to Stripe's apiVersion. Sandbox vs production is chosen by
// REVOLUT_ENV, defaulting to sandbox so a missing/typo'd value can never
// accidentally hit the live environment.

export const REVOLUT_API_VERSION = "2024-09-01";

export function revolutConfigured(): boolean {
  return Boolean(process.env.REVOLUT_SECRET_KEY);
}

/** The Merchant API base URL. Production only when REVOLUT_ENV explicitly names
 * a live environment; everything else (incl. unset) is sandbox — fail safe. */
export function revolutApiBase(): string {
  const env = (process.env.REVOLUT_ENV ?? "").trim().toLowerCase();
  const live = env === "production" || env === "prod" || env === "live";
  return live
    ? "https://merchant.revolut.com"
    : "https://sandbox-merchant.revolut.com";
}

function authHeaders(): Record<string, string> {
  const key = process.env.REVOLUT_SECRET_KEY;
  if (!key) throw new Error("REVOLUT_SECRET_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Revolut-Api-Version": REVOLUT_API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export type RevolutOrder = {
  id: string;
  token?: string;
  // pending | processing | authorised | completed | cancelled | failed
  state: string;
  amount?: number; // minor units, in `currency`
  currency?: string;
  checkout_url?: string;
  // Our external reference (the leadId) lives here in the 2024-09-01 Merchant
  // API — NOT the legacy top-level `merchant_order_ext_ref`. Round-trips via
  // getOrder, which is how the webhook recovers the lead.
  merchant_order_data?: { reference?: string };
};

/**
 * Create a Merchant order and get back a hosted checkout page URL to redirect
 * the customer to (the analog to Stripe Checkout's session.url). `extRef`
 * carries our leadId in `merchant_order_data.reference`; it's stored on the
 * order, so the webhook re-fetches the order to recover the lead. `redirectUrl`
 * is where Revolut returns the customer after payment. capture_mode "automatic"
 * (lowercase — the API rejects uppercase) charges on authorisation.
 */
export async function createOrder(p: {
  amountCents: number;
  currency?: string;
  extRef: string;
  redirectUrl: string;
  description?: string;
}): Promise<RevolutOrder> {
  const res = await fetch(`${revolutApiBase()}/api/orders`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      amount: p.amountCents,
      currency: (p.currency ?? "SGD").toUpperCase(),
      capture_mode: "automatic",
      merchant_order_data: { reference: p.extRef },
      redirect_url: p.redirectUrl,
      description: p.description,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Revolut createOrder ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as RevolutOrder;
}

/**
 * Re-fetch an order from Revolut — the authoritative source for the order's
 * state and the amount actually charged. Merchant webhooks are deliberately
 * thin (just an id + ext_ref), so we GET the order at webhook time rather than
 * trusting any amount supplied in the request.
 */
export async function getOrder(id: string): Promise<RevolutOrder> {
  const res = await fetch(
    `${revolutApiBase()}/api/orders/${encodeURIComponent(id)}`,
    { method: "GET", headers: authHeaders() },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Revolut getOrder ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as RevolutOrder;
}

/**
 * Verify a Merchant webhook signature. Revolut signs the string
 *   "v1." + Revolut-Request-Timestamp + "." + rawBody
 * with HMAC-SHA256 under the per-endpoint signing secret, and sends the hex
 * digest prefixed "v1=" in the Revolut-Signature header. That header may carry
 * several space/comma-separated signatures during a secret rotation — any match
 * is valid. Compared in constant time. Returns false on any malformed input
 * rather than throwing, so a caller can fail closed on a single boolean.
 */
export function verifyWebhookSignature(p: {
  rawBody: string;
  signatureHeader: string | null;
  timestamp: string | null;
  secret: string | undefined;
}): boolean {
  if (!p.signatureHeader || !p.timestamp || !p.secret) return false;
  const payloadToSign = `v1.${p.timestamp}.${p.rawBody}`;
  const expected =
    "v1=" +
    crypto.createHmac("sha256", p.secret).update(payloadToSign).digest("hex");
  const expectedBuf = Buffer.from(expected);
  for (const sig of p.signatureHeader.split(/[\s,]+/).filter(Boolean)) {
    const sigBuf = Buffer.from(sig);
    if (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}
