import "server-only";

import Stripe from "stripe";

// Fixed top-up packs (cents) — the single source of truth for the dashboard
// buttons AND the server-side amount validation. One verified lead = S$88, so
// the packs are 1 / 5 / 10 leads. Change here to change everywhere.
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

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

/**
 * Lazy Stripe singleton. Returns null when STRIPE_SECRET_KEY is unset — callers
 * branch to the offline dev top-up (non-prod) or fail closed (prod). apiVersion
 * is pinned to the SDK's expected literal so an SDK bump can't silently change
 * Checkout behaviour.
 */
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) {
    client = new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  }
  return client;
}
