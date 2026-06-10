import { grantReadings } from "@/lib/credits";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  getOrder,
  readingsForPackCents,
  revolutConfigured,
  verifyWebhookSignature,
} from "@/lib/revolut";

// Node runtime: HMAC signature verification uses Node crypto. force-dynamic so
// the handler is never cached or statically analysed. This route lives under
// /api, which the host proxy (src/proxy.ts) excludes — so Revolut can reach it
// on any host.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sig = request.headers.get("revolut-signature");
  const ts = request.headers.get("revolut-request-timestamp");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const secret = process.env.REVOLUT_WEBHOOK_SECRET;
  // Fail closed: never act on an event we can't cryptographically verify.
  if (!revolutConfigured() || !secret) {
    return new Response("Revolut not configured", { status: 500 });
  }

  // The raw, unparsed body is required for signature verification — verify
  // BEFORE parsing so a forged payload never reaches the handler.
  const raw = await request.text();
  if (
    !verifyWebhookSignature({
      rawBody: raw,
      signatureHeader: sig,
      timestamp: ts,
      secret,
    })
  ) {
    return new Response("Invalid signature", { status: 400 });
  }

  // Replay-attack protection: Revolut-Request-Timestamp is epoch milliseconds
  // (the same unit as Date.now()). Reject the request if the timestamp is
  // absent, not a number, or more than 5 minutes old/ahead — a captured valid
  // request can't be replayed after that window.
  const tsNum = ts !== null ? Number(ts) : NaN;
  if (!ts || Number.isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 300_000) {
    return new Response("Timestamp out of range", { status: 400 });
  }

  let event: { event?: string; order_id?: string };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  try {
    if (event.event === "ORDER_COMPLETED" && event.order_id) {
      // Webhooks are thin (id + ext_ref only): re-fetch the order for the
      // authoritative state and the amount actually charged. Derive the
      // readings from that amount — never from a client/payload value — so a
      // tampered request can't mint credits.
      const order = await getOrder(event.order_id);
      if (order.state === "completed") {
        // Currency guard: the pack prices are SGD minor units; an order in a
        // cheaper currency whose minor-unit amount happens to match (900, 2400,
        // 5600) would silently grant a full pack. Acknowledge (200) so Revolut
        // stops retrying — this is not a transient error.
        if (String(order.currency ?? "").toUpperCase() !== "SGD") {
          console.warn(
            `[revolut webhook] unexpected currency ${order.currency} on order ${order.id} — skipping grant`,
          );
          return new Response(null, { status: 200 });
        }
        const leadId = order.merchant_order_data?.reference;
        const readings = readingsForPackCents(Number(order.amount ?? 0));
        if (leadId && readings) {
          // Idempotent: ref = order id, so a redelivered event grants once.
          await grantReadings({
            leadId,
            amount: readings,
            kind: "purchase",
            ref: order.id,
          });
          const ph = getPostHogClient();
          if (ph) {
            ph.capture({
              distinctId: leadId,
              event: "reading_pack_purchased",
              properties: {
                amount_cents: order.amount,
                readings,
                revolut_order_id: order.id,
                currency: order.currency,
              },
            });
            await ph.flush(); // deliver before the handler returns (serverless)
          }
        }
      }
    }
  } catch (err) {
    // Transient failure (e.g. DB hiccup): 500 so Revolut retries. The
    // UNIQUE(ref) dedupe in grantReadings makes retries safe.
    console.error("[revolut webhook] handler error", err);
    return new Response("Handler error", { status: 500 });
  }

  // 200 for handled and ignored event types alike, so Revolut stops retrying.
  return new Response(null, { status: 200 });
}
