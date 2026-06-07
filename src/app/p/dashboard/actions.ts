"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";

import { claimLead } from "@/lib/agents";
import { isValidTopupAmount } from "@/lib/revolut";
import { destroyAgentSession, getAgentId } from "@/lib/session";
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

  // Agent wallet top-ups (the lead marketplace) are deferred to v2 — consumer
  // reading-credit packs ship first and are the only live Revolut flow. Until a
  // live processor is wired for the agent surface, credit instantly in dev so
  // the wallet flow works offline (mirrors the Twilio OTP "000000" dev path),
  // and fail closed in production — never fabricate a credit.
  if (process.env.NODE_ENV !== "production") {
    await creditWallet({
      agentId,
      amountCents,
      ref: `dev:${crypto.randomUUID()}`,
      kind: "topup",
    });
    console.log(`[wallet dev] credited ${amountCents}c to ${agentId}`);
    redirect("/dashboard?topup=devcredit");
  }
  redirect("/dashboard?error=billing_unavailable");
}

export async function agentLogout() {
  await destroyAgentSession();
  redirect("/login");
}
