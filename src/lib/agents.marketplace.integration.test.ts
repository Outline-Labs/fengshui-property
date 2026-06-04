import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  VERIFIED_PRICE_CENTS,
  applyAgent,
  getAgent,
  getApprovedAgentByEmail,
  getClaimedLeadDetail,
  getClaimsForExport,
  listAvailableLeads,
  listMyClaims,
  sgd,
} from "./agents";
import { db, ensureSchema } from "./db";
import { agents, analyses, claims, leads, walletTransactions } from "./db/schema";

// ---------------------------------------------------------------------------
// Direct-insert seed helpers. The marketplace read paths are pure reads over
// the three tables (leads / analyses / claims), so we build rows by hand rather
// than going through the lead/OTP flow — that keeps each test's fixture obvious
// and lets us forge edge states (suspended agent, half-verified lead) that the
// happy-path helpers can't produce.
// ---------------------------------------------------------------------------

/** A lead row with every notNull column filled; override anything per test. */
async function seedLead(
  id: string,
  over: Partial<typeof leads.$inferInsert> = {},
): Promise<string> {
  const now = Date.now();
  await db.insert(leads).values({
    id,
    email: `${id}@buyer.sg`,
    name: null,
    phone: null,
    propertyInterest: null,
    timeline: null,
    phoneVerified: 0,
    wantsAgent: 0,
    verifiedAt: null,
    otpAttempts: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  });
  return id;
}

/** A sellable lead: OTP-verified phone AND has asked for an agent. */
async function seedSellableLead(
  id: string,
  over: Partial<typeof leads.$inferInsert> = {},
): Promise<string> {
  return seedLead(id, {
    phone: "91234567",
    phoneVerified: 1,
    wantsAgent: 1,
    verifiedAt: Date.now(),
    ...over,
  });
}

async function seedAnalysis(
  id: string,
  leadId: string,
  over: Partial<typeof analyses.$inferInsert> = {},
): Promise<void> {
  await db.insert(analyses).values({
    id,
    leadId,
    kind: "quick",
    facing: null,
    score: null,
    createdAt: Date.now(),
    ...over,
  });
}

async function seedAgent(
  id: string,
  over: Partial<typeof agents.$inferInsert> = {},
): Promise<string> {
  await db.insert(agents).values({
    id,
    email: `${id}@era.sg`,
    name: id,
    agency: "Test",
    resNo: null,
    territories: null,
    status: "approved",
    referredBy: null,
    balanceCents: 0,
    createdAt: Date.now(),
    ...over,
  });
  return id;
}

async function seedClaim(
  id: string,
  agentId: string,
  leadId: string,
  over: Partial<typeof claims.$inferInsert> = {},
): Promise<void> {
  await db.insert(claims).values({
    id,
    leadId,
    agentId,
    tier: "verified",
    priceCents: VERIFIED_PRICE_CENTS,
    claimedAt: Date.now(),
    ...over,
  });
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
// sgd() — money formatting shown to agents. Whole-dollar, no cents.
// ---------------------------------------------------------------------------
describe("sgd", () => {
  it("formats cents as whole-dollar SGD with no decimals", () => {
    expect(sgd(8800)).toBe("S$88");
    expect(sgd(0)).toBe("S$0");
    expect(sgd(VERIFIED_PRICE_CENTS)).toBe("S$88");
  });

  it("rounds to the nearest whole dollar (toFixed(0) semantics)", () => {
    expect(sgd(150)).toBe("S$2"); // 1.50 → 2
    expect(sgd(149)).toBe("S$1"); // 1.49 → 1
  });
});

// ---------------------------------------------------------------------------
// applyAgent — onboarding/approval upsert. The load-bearing invariant is that
// re-applying must NEVER downgrade an already-approved agent back to pending.
// ---------------------------------------------------------------------------
describe("applyAgent", () => {
  it("inserts a brand-new applicant as pending when not approved", async () => {
    await applyAgent({ email: "new@era.sg", name: "New Agent", approved: false });

    const a = await getApprovedAgentByEmail("new@era.sg");
    expect(a).toBeNull(); // pending is not approved

    const rows = await db.select().from(agents).where(eq(agents.email, "new@era.sg"));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].name).toBe("New Agent");
  });

  it("inserts a brand-new applicant as approved when approved=true", async () => {
    await applyAgent({ email: "vip@era.sg", name: "VIP", approved: true });

    const a = await getApprovedAgentByEmail("vip@era.sg");
    expect(a).not.toBeNull();
    expect(a!.status).toBe("approved");
  });

  it("normalizes email (trim + lowercase) and trims/cleans optional fields", async () => {
    await applyAgent({
      email: "  MixedCase@ERA.sg  ",
      name: "  Jane  ",
      agency: "  PropNex  ",
      resNo: "  R12345  ",
      territories: "  D9,D10  ",
      referredBy: "  ref-agent  ",
      approved: false,
    });

    const rows = await db.select().from(agents);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.email).toBe("mixedcase@era.sg");
    expect(r.name).toBe("Jane");
    expect(r.agency).toBe("PropNex");
    expect(r.resNo).toBe("R12345");
    expect(r.territories).toBe("D9,D10");
    expect(r.referredBy).toBe("ref-agent");
    expect(r.status).toBe("pending");
  });

  it("stores null (not empty string) for blank/whitespace-only optional fields", async () => {
    await applyAgent({
      email: "blank@era.sg",
      name: "   ",
      agency: "",
      approved: false,
    });

    const rows = await db.select().from(agents);
    expect(rows[0].name).toBeNull();
    expect(rows[0].agency).toBeNull();
    expect(rows[0].resNo).toBeNull();
    expect(rows[0].territories).toBeNull();
  });

  it("upserts on repeat apply (matched by email) without creating a duplicate row", async () => {
    await applyAgent({ email: "dup@era.sg", name: "First", approved: false });
    await applyAgent({ email: "DUP@era.sg", name: "Second", agency: " NewAgency ", approved: false });

    const rows = await db.select().from(agents).where(eq(agents.email, "dup@era.sg"));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Second");
    expect(rows[0].agency).toBe("NewAgency");
  });

  it("keeps the existing field value when a re-apply omits/blanks that field", async () => {
    await applyAgent({
      email: "keep@era.sg",
      name: "Keep Me",
      agency: "Orig Agency",
      approved: false,
    });
    // Re-apply with name omitted and agency blank — neither should wipe the row.
    await applyAgent({ email: "keep@era.sg", agency: "   ", approved: false });

    const rows = await db.select().from(agents).where(eq(agents.email, "keep@era.sg"));
    expect(rows[0].name).toBe("Keep Me");
    expect(rows[0].agency).toBe("Orig Agency");
  });

  it("NEVER downgrades an approved agent back to pending on re-apply", async () => {
    await applyAgent({ email: "approved@era.sg", name: "Pro", approved: true });
    // A later self-service re-apply arrives with approved=false.
    await applyAgent({ email: "approved@era.sg", name: "Pro Updated", approved: false });

    const a = await getApprovedAgentByEmail("approved@era.sg");
    expect(a).not.toBeNull();
    expect(a!.status).toBe("approved");
    expect(a!.name).toBe("Pro Updated"); // field still updates...
  });

  it("promotes a pending agent to approved when a later apply approves them", async () => {
    await applyAgent({ email: "promote@era.sg", name: "Hopeful", approved: false });
    expect(await getApprovedAgentByEmail("promote@era.sg")).toBeNull();

    await applyAgent({ email: "promote@era.sg", approved: true });
    const a = await getApprovedAgentByEmail("promote@era.sg");
    expect(a).not.toBeNull();
    expect(a!.status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// getApprovedAgentByEmail — the auth gate for the agent portal. Only an
// approved status passes; pending/suspended/missing must all be null.
// ---------------------------------------------------------------------------
describe("getApprovedAgentByEmail", () => {
  it("returns the agent when approved", async () => {
    await seedAgent("a-app", { email: "ok@era.sg", status: "approved" });
    const a = await getApprovedAgentByEmail("ok@era.sg");
    expect(a).not.toBeNull();
    expect(a!.id).toBe("a-app");
  });

  it("returns null for a pending agent", async () => {
    await seedAgent("a-pend", { email: "pend@era.sg", status: "pending" });
    expect(await getApprovedAgentByEmail("pend@era.sg")).toBeNull();
  });

  it("returns null for a suspended agent", async () => {
    await seedAgent("a-susp", { email: "susp@era.sg", status: "suspended" });
    expect(await getApprovedAgentByEmail("susp@era.sg")).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    expect(await getApprovedAgentByEmail("nobody@era.sg")).toBeNull();
  });

  it("matches case-insensitively and trims the lookup email", async () => {
    await seedAgent("a-ci", { email: "case@era.sg", status: "approved" });
    const a = await getApprovedAgentByEmail("  CASE@ERA.sg  ");
    expect(a).not.toBeNull();
    expect(a!.id).toBe("a-ci");
  });
});

// ---------------------------------------------------------------------------
// getAgent — by id, any status (used after the email gate, to load self).
// ---------------------------------------------------------------------------
describe("getAgent", () => {
  it("returns the agent regardless of status", async () => {
    await seedAgent("a-any", { status: "suspended" });
    const a = await getAgent("a-any");
    expect(a).not.toBeNull();
    expect(a!.status).toBe("suspended");
  });

  it("returns null for an unknown id", async () => {
    expect(await getAgent("missing")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listAvailableLeads — the marketplace board. A lead shows ONLY when it is
// phoneVerified=1 AND wantsAgent=1 AND not already claimed. Ordered newest
// (by verifiedAt, falling back to createdAt) first.
// ---------------------------------------------------------------------------
describe("listAvailableLeads", () => {
  it("returns an empty array when there are no leads", async () => {
    expect(await listAvailableLeads()).toEqual([]);
  });

  it("includes only verified + wants-agent + unclaimed leads", async () => {
    const sellable = await seedSellableLead("sellable");
    await seedLead("not-verified", { phoneVerified: 0, wantsAgent: 1, verifiedAt: Date.now() });
    await seedLead("no-agent", { phoneVerified: 1, wantsAgent: 0, verifiedAt: Date.now() });
    const claimed = await seedSellableLead("already-claimed");
    const agent = await seedAgent("a1");
    await seedClaim("c1", agent, claimed);

    const out = await listAvailableLeads();
    expect(out.map((l) => l.id)).toEqual([sellable]);
  });

  it("prices every listed lead at VERIFIED_PRICE_CENTS", async () => {
    await seedSellableLead("priced");
    const [l] = await listAvailableLeads();
    expect(l.priceCents).toBe(VERIFIED_PRICE_CENTS);
  });

  it("sorts by verifiedAt descending (newest first)", async () => {
    await seedSellableLead("old", { verifiedAt: 1_000 });
    await seedSellableLead("mid", { verifiedAt: 2_000 });
    await seedSellableLead("new", { verifiedAt: 3_000 });

    const out = await listAvailableLeads();
    expect(out.map((l) => l.id)).toEqual(["new", "mid", "old"]);
  });

  it("falls back to createdAt for sort when verifiedAt is null", async () => {
    // Both sellable but missing verifiedAt → ordered by createdAt desc.
    await seedSellableLead("c-old", { verifiedAt: null, createdAt: 100 });
    await seedSellableLead("c-new", { verifiedAt: null, createdAt: 500 });

    const out = await listAvailableLeads();
    expect(out.map((l) => l.id)).toEqual(["c-new", "c-old"]);
  });

  it("aggregates analysisCount and topScore per lead, ignoring null scores for the top", async () => {
    const lead = await seedSellableLead("stats");
    await seedAnalysis("an1", lead, { score: 7.2 });
    await seedAnalysis("an2", lead, { score: 9.4 });
    await seedAnalysis("an3", lead, { score: null }); // counts toward count, not top

    const [l] = await listAvailableLeads();
    expect(l.analysisCount).toBe(3);
    expect(l.topScore).toBe(9.4);
  });

  it("reports analysisCount=0 and topScore=null for a lead with no analyses", async () => {
    await seedSellableLead("no-analyses");
    const [l] = await listAvailableLeads();
    expect(l.analysisCount).toBe(0);
    expect(l.topScore).toBeNull();
  });

  it("carries through the lead's propertyInterest, timeline, and verifiedAt", async () => {
    await seedSellableLead("fields", {
      propertyInterest: "Condo D9",
      timeline: "3 months",
      verifiedAt: 4242,
    });
    const [l] = await listAvailableLeads();
    expect(l.propertyInterest).toBe("Condo D9");
    expect(l.timeline).toBe("3 months");
    expect(l.verifiedAt).toBe(4242);
  });
});

// ---------------------------------------------------------------------------
// listMyClaims — the agent's own claimed leads, joined to lead data, newest
// claim first. Scoped strictly to the asking agent.
// ---------------------------------------------------------------------------
describe("listMyClaims", () => {
  it("returns an empty array when the agent has no claims", async () => {
    await seedAgent("lonely");
    expect(await listMyClaims("lonely")).toEqual([]);
  });

  it("returns only this agent's claims, never another agent's", async () => {
    const mine = await seedSellableLead("mine");
    const theirs = await seedSellableLead("theirs");
    const me = await seedAgent("me");
    const other = await seedAgent("other");
    await seedClaim("c-mine", me, mine);
    await seedClaim("c-theirs", other, theirs);

    const out = await listMyClaims(me);
    expect(out.map((c) => c.leadId)).toEqual([mine]);
  });

  it("joins lead fields onto each claim and surfaces analysis stats", async () => {
    const lead = await seedSellableLead("joined", {
      email: "joined@buyer.sg",
      name: "Buyer Bob",
      phone: "98765432",
      propertyInterest: "Landed Bukit Timah",
      timeline: "ASAP",
    });
    const me = await seedAgent("joiner");
    await seedClaim("c-join", me, lead, { tier: "verified", priceCents: 8800, claimedAt: 555 });
    await seedAnalysis("ja1", lead, { score: 6.0 });
    await seedAnalysis("ja2", lead, { score: 8.5 });

    const [c] = await listMyClaims(me);
    expect(c).toMatchObject({
      leadId: "joined",
      tier: "verified",
      priceCents: 8800,
      claimedAt: 555,
      email: "joined@buyer.sg",
      name: "Buyer Bob",
      phone: "98765432",
      propertyInterest: "Landed Bukit Timah",
      timeline: "ASAP",
      readings: 2,
      bestScore: 8.5,
    });
  });

  it("sorts claims by claimedAt descending", async () => {
    const me = await seedAgent("sorter");
    const l1 = await seedSellableLead("l1");
    const l2 = await seedSellableLead("l2");
    const l3 = await seedSellableLead("l3");
    await seedClaim("cl1", me, l1, { claimedAt: 100 });
    await seedClaim("cl2", me, l2, { claimedAt: 300 });
    await seedClaim("cl3", me, l3, { claimedAt: 200 });

    const out = await listMyClaims(me);
    expect(out.map((c) => c.leadId)).toEqual(["l2", "l3", "l1"]);
  });
});

// ---------------------------------------------------------------------------
// getClaimsForExport — the CSV download. Same scoping as listMyClaims, but
// every field is a display string: phone normalized to +65 ####, score as
// "x.x/10", claimedDate as YYYY-MM-DD, nulls as "".
// ---------------------------------------------------------------------------
describe("getClaimsForExport", () => {
  it("formats a fully-populated claim into display strings", async () => {
    const lead = await seedSellableLead("exp", {
      email: "exp@buyer.sg",
      name: "Export Eve",
      phone: "91234567",
      propertyInterest: "Condo D15",
      timeline: "6 months",
    });
    const me = await seedAgent("exporter");
    // 2021-06-15T00:00:00Z = 1623715200000
    await seedClaim("c-exp", me, lead, { claimedAt: 1623715200000 });
    await seedAnalysis("ea1", lead, { score: 7.25 });
    await seedAnalysis("ea2", lead, { score: 8.75 });

    const [row] = await getClaimsForExport(me);
    expect(row).toEqual({
      name: "Export Eve",
      phone: "+65 91234567",
      email: "exp@buyer.sg",
      propertyInterest: "Condo D15",
      timeline: "6 months",
      readings: "2",
      bestScore: "8.8/10", // 8.75 → toFixed(1) → "8.8"
      claimedDate: "2021-06-15",
    });
  });

  it("strips a leading 65 country code and non-digits before formatting", async () => {
    const lead = await seedSellableLead("pfmt", { phone: "+65 9123-4567" });
    const me = await seedAgent("pf-agent");
    await seedClaim("c-pf", me, lead);
    const [row] = await getClaimsForExport(me);
    expect(row.phone).toBe("+65 91234567");
  });

  it("leaves a non-SG-mobile phone unformatted (passthrough)", async () => {
    const lead = await seedSellableLead("badphone", { phone: "12345" });
    const me = await seedAgent("bp-agent");
    await seedClaim("c-bp", me, lead);
    const [row] = await getClaimsForExport(me);
    expect(row.phone).toBe("12345");
  });

  it("renders empty strings for null fields and an absent score", async () => {
    const lead = await seedSellableLead("empties", {
      name: null,
      phone: null,
      propertyInterest: null,
      timeline: null,
    });
    const me = await seedAgent("e-agent");
    await seedClaim("c-e", me, lead);

    const [row] = await getClaimsForExport(me);
    expect(row.name).toBe("");
    expect(row.phone).toBe("");
    expect(row.propertyInterest).toBe("");
    expect(row.timeline).toBe("");
    expect(row.readings).toBe("0");
    expect(row.bestScore).toBe("");
  });

  it("sorts export rows by claimedAt descending", async () => {
    const me = await seedAgent("e-sorter");
    const a = await seedSellableLead("ea", { name: "A", claimedAt: undefined });
    const b = await seedSellableLead("eb", { name: "B" });
    await seedClaim("ce-a", me, a, { claimedAt: 1000 });
    await seedClaim("ce-b", me, b, { claimedAt: 5000 });

    const out = await getClaimsForExport(me);
    expect(out.map((r) => r.name)).toEqual(["B", "A"]);
  });

  it("returns only this agent's rows", async () => {
    const mine = await seedSellableLead("mine-exp", { name: "Mine" });
    const theirs = await seedSellableLead("their-exp", { name: "Theirs" });
    const me = await seedAgent("me-exp");
    const other = await seedAgent("other-exp");
    await seedClaim("cm", me, mine);
    await seedClaim("co", other, theirs);

    const out = await getClaimsForExport(me);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Mine");
  });
});

// ---------------------------------------------------------------------------
// getClaimedLeadDetail — the full unlocked lead view. ONLY the owning agent
// may see it; for any other agent (or an unclaimed/unknown lead) it must be
// null — this is the paywall that stops one agent reading another's purchase.
// ---------------------------------------------------------------------------
describe("getClaimedLeadDetail", () => {
  it("returns the detail (lead + sorted analyses) for the owning agent", async () => {
    const lead = await seedSellableLead("detail", {
      email: "detail@buyer.sg",
      name: "Detail Dan",
    });
    const me = await seedAgent("owner");
    await seedClaim("c-detail", me, lead, { tier: "verified", priceCents: 8800, claimedAt: 777 });
    await seedAnalysis("da1", lead, { facing: "S", score: 5.0, createdAt: 100 });
    await seedAnalysis("da2", lead, { facing: "N", score: 8.0, createdAt: 300 });
    await seedAnalysis("da3", lead, { facing: "E", score: 6.0, createdAt: 200 });

    const detail = await getClaimedLeadDetail(me, lead);
    expect(detail).not.toBeNull();
    expect(detail!.tier).toBe("verified");
    expect(detail!.priceCents).toBe(8800);
    expect(detail!.claimedAt).toBe(777);
    expect(detail!.lead.id).toBe("detail");
    expect(detail!.lead.email).toBe("detail@buyer.sg");
    // analyses sorted createdAt descending
    expect(detail!.analyses.map((a) => a.createdAt)).toEqual([300, 200, 100]);
    expect(detail!.analyses[0]).toEqual({ facing: "N", score: 8.0, createdAt: 300 });
  });

  it("returns null for an agent who does NOT own the claim", async () => {
    const lead = await seedSellableLead("guarded");
    const owner = await seedAgent("the-owner");
    const intruder = await seedAgent("the-intruder");
    await seedClaim("c-guard", owner, lead);

    expect(await getClaimedLeadDetail(intruder, lead)).toBeNull();
    // Sanity: the rightful owner still gets it.
    expect(await getClaimedLeadDetail(owner, lead)).not.toBeNull();
  });

  it("returns null for an unclaimed lead", async () => {
    const lead = await seedSellableLead("unclaimed");
    const agent = await seedAgent("hopeful-agent");
    expect(await getClaimedLeadDetail(agent, lead)).toBeNull();
  });

  it("returns null for an unknown lead id", async () => {
    const agent = await seedAgent("any-agent");
    expect(await getClaimedLeadDetail(agent, "no-such-lead")).toBeNull();
  });

  it("returns an empty analyses array when the claimed lead has none", async () => {
    const lead = await seedSellableLead("no-an");
    const me = await seedAgent("no-an-owner");
    await seedClaim("c-no-an", me, lead);
    const detail = await getClaimedLeadDetail(me, lead);
    expect(detail).not.toBeNull();
    expect(detail!.analyses).toEqual([]);
  });
});
