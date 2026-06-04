import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { VERIFIED_PRICE_CENTS, claimLead } from "./agents";
import { db, ensureSchema } from "./db";
import { agents, analyses, claims, leads, walletTransactions } from "./db/schema";
import { upsertLead, verifyOtpAndRequestAgent, requestOtp } from "./leads";
import { getWallet } from "./wallet";

// Agents now need a funded wallet to claim. Default to comfortably-funded so a
// test that isn't about money doesn't have to think about it; pass 0 to assert
// the unfunded path.
async function approvedAgent(id: string, email: string, balanceCents = VERIFIED_PRICE_CENTS * 10) {
  await db.insert(agents).values({
    id,
    email,
    name: id,
    agency: "Test",
    resNo: null,
    territories: null,
    status: "approved",
    referredBy: null,
    balanceCents,
    createdAt: Date.now(),
  });
  return id;
}

/** Create a lead that is sellable (OTP-verified + wants an agent). */
async function sellableLead(email: string): Promise<string> {
  const id = await upsertLead({ email });
  const otp = await requestOtp(id, "91234567");
  const code = otp.ok ? otp.devCode! : "";
  await verifyOtpAndRequestAgent(id, code);
  return id;
}

beforeEach(async () => {
  await ensureSchema();
  await db.delete(claims);
  await db.delete(walletTransactions);
  await db.delete(analyses);
  await db.delete(leads);
  await db.delete(agents);
});

// ---------------------------------------------------------------------------
// FCFS exclusivity: a lead can be sold to exactly ONE agent. Double-selling is
// the single worst trust failure for the marketplace, so the race must be
// closed by the DB (UNIQUE on claims.leadId), not by luck of timing. With the
// wallet, the second invariant is that a losing racer is NEVER charged.
// ---------------------------------------------------------------------------
describe("claimLead — first-come-first-served exclusivity", () => {
  it("lets exactly one of two concurrent claims win, and never charges the loser", async () => {
    const leadId = await sellableLead("race@test.sg");
    const a1 = await approvedAgent("agent-1", "a1@era.sg", VERIFIED_PRICE_CENTS);
    const a2 = await approvedAgent("agent-2", "a2@era.sg", VERIFIED_PRICE_CENTS);

    const [r1, r2] = await Promise.all([
      claimLead(a1, leadId),
      claimLead(a2, leadId),
    ]);

    const wins = [r1, r2].filter((r) => r.ok).length;
    expect(wins).toBe(1);

    const rows = await db.select().from(claims);
    expect(rows).toHaveLength(1);

    // The winner paid exactly once (balance 0); the loser is fully refunded by
    // the batch rollback (balance still the full price).
    const [b1, b2] = [
      (await getWallet(a1)).balanceCents,
      (await getWallet(a2)).balanceCents,
    ];
    expect([b1, b2].filter((b) => b === 0)).toHaveLength(1);
    expect([b1, b2].filter((b) => b === VERIFIED_PRICE_CENTS)).toHaveLength(1);
  });

  it("rejects a claim on an unverified lead without touching the wallet", async () => {
    const leadId = await upsertLead({ email: "unverified@test.sg" });
    const a1 = await approvedAgent("agent-1", "a1@era.sg");

    const res = await claimLead(a1, leadId);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unavailable");
    // Sellability is checked before funds, so a funded agent isn't debited.
    expect((await getWallet(a1)).balanceCents).toBe(VERIFIED_PRICE_CENTS * 10);
  });

  it("rejects a second sequential claim on an already-claimed lead, charging only the winner", async () => {
    const leadId = await sellableLead("taken@test.sg");
    const a1 = await approvedAgent("agent-1", "a1@era.sg");
    const a2 = await approvedAgent("agent-2", "a2@era.sg");

    const first = await claimLead(a1, leadId);
    const second = await claimLead(a2, leadId);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("taken");
    // The loser's wallet is untouched.
    expect((await getWallet(a2)).balanceCents).toBe(VERIFIED_PRICE_CENTS * 10);
  });
});

// ---------------------------------------------------------------------------
// Wallet gating: a claim spends real money. It must debit exactly the price,
// leave an auditable ledger entry, and be impossible when the agent is short.
// ---------------------------------------------------------------------------
describe("claimLead — wallet debit", () => {
  it("debits the price and writes a claim_debit ledger row keyed to the claim", async () => {
    const leadId = await sellableLead("debit@test.sg");
    const a1 = await approvedAgent("agent-1", "a1@era.sg", VERIFIED_PRICE_CENTS * 2);

    const res = await claimLead(a1, leadId);

    expect(res.ok).toBe(true);
    expect((await getWallet(a1)).balanceCents).toBe(VERIFIED_PRICE_CENTS);

    const claim = (await db.select().from(claims).where(eq(claims.agentId, a1)))[0];
    const ledger = (
      await db.select().from(walletTransactions).where(eq(walletTransactions.agentId, a1))
    )[0];
    expect(ledger.kind).toBe("claim_debit");
    expect(ledger.amountCents).toBe(-VERIFIED_PRICE_CENTS);
    expect(ledger.ref).toBe(claim.id);
    expect(ledger.balanceAfter).toBe(VERIFIED_PRICE_CENTS);
  });

  it("rejects an unfunded agent's claim cleanly — no claim row, no debit, no ledger", async () => {
    const leadId = await sellableLead("broke@test.sg");
    const a1 = await approvedAgent("agent-1", "a1@era.sg", VERIFIED_PRICE_CENTS - 1); // one cent short

    const res = await claimLead(a1, leadId);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("insufficient_funds");
    expect(await db.select().from(claims)).toHaveLength(0);
    expect((await getWallet(a1)).balanceCents).toBe(VERIFIED_PRICE_CENTS - 1);
    expect(await db.select().from(walletTransactions)).toHaveLength(0);
  });

  it("does not overdraw across two leads when funded for only one", async () => {
    const leadA = await sellableLead("leadA@test.sg");
    const leadB = await sellableLead("leadB@test.sg");
    const a1 = await approvedAgent("agent-1", "a1@era.sg", VERIFIED_PRICE_CENTS);

    const [rA, rB] = await Promise.all([
      claimLead(a1, leadA),
      claimLead(a1, leadB),
    ]);

    const wins = [rA, rB].filter((r) => r.ok).length;
    expect(wins).toBe(1);
    expect((await getWallet(a1)).balanceCents).toBe(0);
    expect(await db.select().from(claims)).toHaveLength(1);
  });
});
