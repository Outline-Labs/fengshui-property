import { grantReadings } from "@/lib/credits";
import { getPostHogClient } from "@/lib/posthog-server";
import { readingsForPackCents, stripe } from "@/lib/stripe";
import { creditWallet } from "@/lib/wallet";

// Node runtime: Stripe's signature verification uses Node crypto (sync HMAC),
// which the Edge runtime can't do. force-dynamic so the handler is never cached
// or statically analysed. This route lives under /api, which the host proxy
// (src/proxy.ts) excludes — so Stripe can reach it on any host.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  // Fail closed: never act on an event we can't cryptographically verify.
  if (!s || !secret) {
    return new Response("Stripe not configured", { status: 500 });
  }

  // The raw, unparsed body is required for signature verification — do NOT call
  // request.json() first (it would re-serialise and break the signature).
  const raw = await request.text();
  let event;
  try {
    event = s.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        const leadId = session.metadata?.leadId;
        const agentId = session.metadata?.agentId;
        if (leadId) {
          // Consumer reading-pack purchase. Derive the readings from the amount
          // actually charged (authoritative), not a client-supplied count.
          const readings = readingsForPackCents(Number(session.amount_total ?? 0));
          if (readings) {
            // Idempotent: ref = session id, so a redelivered event grants once.
            await grantReadings({
              leadId,
              amount: readings,
              kind: "purchase",
              ref: session.id,
            });
            const ph = getPostHogClient();
            if (ph) {
              ph.capture({
                distinctId: leadId,
                event: "reading_pack_purchased",
                properties: {
                  amount_cents: session.amount_total,
                  readings,
                  stripe_session_id: session.id,
                  currency: session.currency,
                },
              });
              await ph.flush(); // deliver before the handler returns (serverless)
            }
          }
        } else if (agentId) {
          const topupCents = Number(session.metadata?.topupCents ?? 0);
          if (Number.isInteger(topupCents) && topupCents > 0) {
            await creditWallet({
              agentId,
              amountCents: topupCents,
              ref: session.id,
              kind: "topup",
            });
          }
        }
      }
    }
  } catch (err) {
    // Transient failure (e.g. DB hiccup): 500 so Stripe retries. The UNIQUE(ref)
    // dedupe makes retries safe.
    console.error("[stripe webhook] handler error", err);
    return new Response("Handler error", { status: 500 });
  }

  // 200 for handled and ignored event types alike, so Stripe stops retrying.
  return new Response(null, { status: 200 });
}
