import "server-only";

import Stripe from "stripe";

// Fixed top-up packs (cents) — the single source of truth for the dashboard
// buttons AND the server-side amount validation. One verified lead = S$88, so
// the packs are 1 / 5 / 10 leads. Change here to change everywhere.
export const TOPUP_PACKS_CENTS = [8800, 44000, 88000] as const;

export function isValidTopupAmount(cents: number): boolean {
  return (TOPUP_PACKS_CENTS as readonly number[]).includes(cents);
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
