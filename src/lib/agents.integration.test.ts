import { beforeEach, describe, expect, it } from "vitest";

import { claimLead } from "./agents";
import { db, ensureSchema } from "./db";
import { agents, analyses, claims, leads } from "./db/schema";
import { upsertLead, verifyOtpAndRequestAgent, requestOtp } from "./leads";

async function approvedAgent(id: string, email: string) {
  await db.insert(agents).values({
    id,
    email,
    name: id,
    agency: "Test",
    resNo: null,
    territories: null,
    status: "approved",
    referredBy: null,
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
  await db.delete(analyses);
  await db.delete(leads);
  await db.delete(agents);
});

// ---------------------------------------------------------------------------
// FCFS exclusivity: a lead can be sold to exactly ONE agent. Double-selling is
// the single worst trust failure for the marketplace, so the race must be
// closed by the DB (UNIQUE on claims.leadId), not by luck of timing.
// ---------------------------------------------------------------------------
describe("claimLead — first-come-first-served exclusivity", () => {
  it("lets exactly one of two concurrent claims win", async () => {
    const leadId = await sellableLead("race@test.sg");
    const a1 = await approvedAgent("agent-1", "a1@era.sg");
    const a2 = await approvedAgent("agent-2", "a2@era.sg");

    const [r1, r2] = await Promise.all([
      claimLead(a1, leadId),
      claimLead(a2, leadId),
    ]);

    const wins = [r1, r2].filter((r) => r.ok).length;
    expect(wins).toBe(1);

    const rows = await db.select().from(claims);
    expect(rows).toHaveLength(1);
  });

  it("rejects a claim on an unverified lead", async () => {
    const leadId = await upsertLead({ email: "unverified@test.sg" });
    const a1 = await approvedAgent("agent-1", "a1@era.sg");
    const res = await claimLead(a1, leadId);
    expect(res.ok).toBe(false);
  });

  it("rejects a second sequential claim on an already-claimed lead", async () => {
    const leadId = await sellableLead("taken@test.sg");
    const a1 = await approvedAgent("agent-1", "a1@era.sg");
    const a2 = await approvedAgent("agent-2", "a2@era.sg");
    expect((await claimLead(a1, leadId)).ok).toBe(true);
    expect((await claimLead(a2, leadId)).ok).toBe(false);
  });
});
