"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { grantReadings } from "@/lib/credits";
import { safeConsumerHost } from "@/lib/consumer-hosts";
import { getPostHogClient } from "@/lib/posthog-server";
import { getLeadId } from "@/lib/session";
import { readingsForPackCents, stripe } from "@/lib/stripe";

/**
 * Buy a reading-credit pack via hosted Stripe Checkout. The price is validated
 * against READING_PACKS server-side and the readings are derived from it (the
 * webhook re-derives from the charged amount), so a tampered form can't mint
 * credits. Mirrors the agent wallet top-up: dev-credits instantly with no Stripe
 * keys (non-prod), fails closed in prod.
 */
export async function buyReadingsAction(formData: FormData) {
  const leadId = await getLeadId();
  if (!leadId) redirect("/signup?next=/upload");

  const cents = Number(formData.get("cents"));
  const readings = readingsForPackCents(cents);
  if (!readings) redirect("/upload?error=badpack");

  const s = stripe();
  if (!s) {
    // No Stripe keys. In dev, grant instantly so the flow works offline (mirrors
    // the OTP "000000" dev path). In prod, fail closed — never fabricate credit.
    if (process.env.NODE_ENV !== "production") {
      await grantReadings({
        leadId,
        amount: readings,
        kind: "purchase",
        ref: `dev:${crypto.randomUUID()}`,
      });
      redirect("/upload?credits=devcredit");
    }
    redirect("/upload?error=billing_unavailable");
  }

  const h = await headers();
  const host = safeConsumerHost(h.get("host"));
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "sgd",
          unit_amount: cents,
          product_data: { name: `Fengshui AI · ${readings} reading credits` },
        },
        quantity: 1,
      },
    ],
    // The webhook reads leadId; readings are re-derived from amount_total.
    metadata: { leadId, kind: "reading_pack", readings: String(readings) },
    success_url: `${origin}/upload?credits=success`,
    cancel_url: `${origin}/upload?credits=cancelled`,
  });

  if (!session.url) redirect("/upload?error=billing_unavailable");

  const ph = getPostHogClient();
  if (ph) {
    ph.capture({
      distinctId: leadId,
      event: "reading_pack_checkout_started",
      properties: {
        amount_cents: cents,
        readings,
        stripe_session_id: session.id,
      },
    });
    await ph.flush(); // deliver before the action redirects (serverless)
  }

  redirect(session.url);
}
