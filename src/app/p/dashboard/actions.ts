"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { claimLead } from "@/lib/agents";
import { safePartnerHost } from "@/lib/partner-hosts";
import { destroyAgentSession, getAgentId } from "@/lib/session";
import { isValidTopupAmount, stripe } from "@/lib/stripe";
import { creditWallet } from "@/lib/wallet";

export async function claimAction(formData: FormData) {
  const leadId = formData.get("leadId")?.toString() ?? "";
  const agentId = await getAgentId();
  if (!agentId) redirect("/login");
  const result = await claimLead(agentId, leadId);
  if (!result.ok) {
    redirect(
      result.reason === "insufficient_funds"
        ? "/dashboard?error=insufficient"
        : "/dashboard?error=taken",
    );
  }
  redirect(`/leads/${leadId}`);
}

export async function topUpAction(formData: FormData) {
  const agentId = await getAgentId();
  if (!agentId) redirect("/login");

  // Never trust the client amount — it must be one of our fixed packs.
  const amountCents = Number(formData.get("amountCents"));
  if (!isValidTopupAmount(amountCents)) redirect("/dashboard?error=badamount");

  const s = stripe();
  if (!s) {
    // No Stripe keys configured. In dev, credit instantly so the wallet flow
    // works offline (mirrors the Twilio OTP "000000" dev path). In prod, fail
    // closed — never fabricate a credit.
    if (process.env.NODE_ENV !== "production") {
      await creditWallet({
        agentId,
        amountCents,
        ref: `dev:${crypto.randomUUID()}`,
        kind: "topup",
      });
      console.log(`[Stripe dev] credited ${amountCents}c to ${agentId}`);
      redirect("/dashboard?topup=devcredit");
    }
    redirect("/dashboard?error=billing_unavailable");
  }

  // Build the return URLs from an allowlisted host so a forged Host header
  // can't redirect the agent (and their session) to an attacker domain.
  const h = await headers();
  const host = safePartnerHost(h.get("host"));
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "sgd",
          unit_amount: amountCents,
          product_data: { name: "Lead wallet top-up" },
        },
        quantity: 1,
      },
    ],
    // The webhook reads these to credit the right wallet by the right amount.
    metadata: { agentId, topupCents: String(amountCents) },
    success_url: `${origin}/dashboard?topup=success`,
    cancel_url: `${origin}/dashboard?topup=cancelled`,
  });

  if (!session.url) redirect("/dashboard?error=billing_unavailable");
  redirect(session.url);
}

export async function agentLogout() {
  await destroyAgentSession();
  redirect("/login");
}
