"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeConsumerHost } from "@/lib/consumer-hosts";
import { grantReadings } from "@/lib/credits";
import { getLead } from "@/lib/leads";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  createOrder,
  readingsForPackCents,
  revolutConfigured,
} from "@/lib/revolut";
import { getLeadId } from "@/lib/session";

/**
 * Buy a reading-credit pack via the Revolut hosted checkout page. The price is
 * validated against READING_PACKS server-side and the readings are derived from
 * it (the webhook re-derives from the order amount Revolut confirms), so a
 * tampered form can't mint credits. Mirrors the dev pattern elsewhere:
 * dev-credits instantly with no Revolut keys (non-prod), fails closed in prod.
 */
export async function buyReadingsAction(formData: FormData) {
  const leadId = await getLeadId();
  if (!leadId) redirect("/signup?next=/upload");

  const cents = Number(formData.get("cents"));
  const readings = readingsForPackCents(cents);
  if (!readings) redirect("/upload?error=badpack");

  // Gate purchases on a verified email — don't take money from a typo'd or
  // unverified address.
  const lead = await getLead(leadId);
  if (!lead?.emailVerified) redirect("/upload?error=verify_email");

  if (!revolutConfigured()) {
    // No Revolut keys. In local dev only, grant instantly so the flow works
    // offline (mirrors the OTP "000000" dev path). In any deployed environment
    // (NODE_ENV=production OR running on Vercel) fail closed — never fabricate
    // credit, even if NODE_ENV is mis-set.
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
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

  // extRef carries the leadId — echoed in the ORDER_COMPLETED webhook and on the
  // order — so the webhook credits the right lead; readings are re-derived from
  // the order amount. Revolut has a single redirect_url (no success/cancel
  // split), so the webhook is the source of truth and the return page only
  // announces "payment received" (?credits=done).
  const order = await createOrder({
    amountCents: cents,
    currency: "SGD",
    extRef: leadId,
    redirectUrl: `${origin}/upload?credits=done`,
    description: `Fengshui AI · ${readings} reading credits`,
  });

  if (!order.checkout_url) redirect("/upload?error=billing_unavailable");

  const ph = getPostHogClient();
  if (ph) {
    ph.capture({
      distinctId: leadId,
      event: "reading_pack_checkout_started",
      properties: {
        amount_cents: cents,
        readings,
        revolut_order_id: order.id,
      },
    });
    await ph.flush(); // deliver before the action redirects (serverless)
  }

  redirect(order.checkout_url);
}
