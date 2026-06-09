import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_REWARDED_REFERRALS,
  REFEREE_BONUS,
  REFERRAL_REWARD,
  applyReferralActivation,
  attachReferral,
  getReferralCode,
  getReferralStats,
  grantReadings,
} from "./credits";
import { db, ensureSchema } from "./db";
import { analyses, leads, readingGrants } from "./db/schema";
import { getCredits, reserveReading, upsertLead } from "./leads";

beforeEach(async () => {
  await ensureSchema();
  await db.delete(readingGrants);
  await db.delete(analyses);
  await db.delete(leads);
});

// ---------------------------------------------------------------------------
// Consumer reading credits mirror the agent wallet: bonus_readings is the fast
// cached count, reading_grants the append-only source of truth, UNIQUE(ref) the
// idempotency key. Credits extend the free quota; referrals mint them when a
// referred user actually completes a reading (not on a bare signup).
// ---------------------------------------------------------------------------
describe("grantReadings — credits land exactly once", () => {
  it("increases bonus_readings and writes one ledger row with the right balance_after", async () => {
    const id = await upsertLead({ email: "g1@test.sg" });

    const r = await grantReadings({
      leadId: id,
      amount: 3,
      kind: "purchase",
      ref: "stripe:sess_1",
    });
    expect(r.deduped).toBe(false);
    expect(r.bonusReadings).toBe(3);

    const rows = await db
      .select()
      .from(readingGrants)
      .where(eq(readingGrants.leadId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(3);
    expect(rows[0].balanceAfter).toBe(3);
  });

  it("is idempotent on a duplicate ref — granted once, one ledger row", async () => {
    const id = await upsertLead({ email: "g2@test.sg" });
    await grantReadings({ leadId: id, amount: 5, kind: "purchase", ref: "dupe" });
    const second = await grantReadings({
      leadId: id,
      amount: 5,
      kind: "purchase",
      ref: "dupe",
    });
    expect(second.deduped).toBe(true);
    expect(second.bonusReadings).toBe(5);
    const rows = await db
      .select()
      .from(readingGrants)
      .where(eq(readingGrants.leadId, id));
    expect(rows).toHaveLength(1);
  });
});

describe("bonus readings extend the free quota", () => {
  it("lets a quota-1 lead reserve 1 + bonus readings, then blocks the next", async () => {
    const id = await upsertLead({ email: "q@test.sg" }); // email-only ⇒ free quota 1
    await db.update(leads).set({ emailVerified: 1 }).where(eq(leads.id, id)); // credits need a verified email
    await grantReadings({ leadId: id, amount: 2, kind: "purchase", ref: "p" });

    // 1 free + 2 bonus = 3 reservable
    expect((await reserveReading(id)).ok).toBe(true);
    expect((await reserveReading(id)).ok).toBe(true);
    expect((await reserveReading(id)).ok).toBe(true);
    const fourth = await reserveReading(id);
    expect(fourth.ok).toBe(false);

    const credits = await getCredits(id);
    expect(credits.freeQuota).toBe(1);
    expect(credits.bonusReadings).toBe(2);
    expect(credits.quota).toBe(3);
    expect(credits.remaining).toBe(0);
  });
});

describe("referral codes", () => {
  it("mints a stable, unique code per lead", async () => {
    const a = await upsertLead({ email: "a@test.sg" });
    const b = await upsertLead({ email: "b@test.sg" });
    const codeA1 = await getReferralCode(a);
    const codeA2 = await getReferralCode(a);
    const codeB = await getReferralCode(b);
    expect(codeA1).toBeTruthy();
    expect(codeA1).toBe(codeA2); // stable across calls
    expect(codeA1).not.toBe(codeB); // unique per lead
  });
});

describe("attachReferral — the referee's signup bonus", () => {
  it("credits the referee REFEREE_BONUS and records who referred them", async () => {
    const referrer = await upsertLead({ email: "ref@test.sg" });
    const code = await getReferralCode(referrer);
    const referee = await upsertLead({ email: "new@test.sg" });

    await attachReferral(referee, code);

    const credits = await getCredits(referee);
    expect(credits.bonusReadings).toBe(REFEREE_BONUS);
    const row = await db.select().from(leads).where(eq(leads.id, referee));
    expect(row[0].referredBy).toBe(code);
  });

  it("ignores a self-referral and an unknown code, and never double-credits", async () => {
    const me = await upsertLead({ email: "me@test.sg" });
    const myCode = await getReferralCode(me);
    await attachReferral(me, myCode); // self
    await attachReferral(me, "NOPE0000"); // unknown
    expect((await getCredits(me)).bonusReadings).toBe(0);

    const referrer = await upsertLead({ email: "r2@test.sg" });
    const code = await getReferralCode(referrer);
    const referee = await upsertLead({ email: "fr@test.sg" });
    await attachReferral(referee, code);
    await attachReferral(referee, code); // second attempt is a no-op
    expect((await getCredits(referee)).bonusReadings).toBe(REFEREE_BONUS);
  });
});

describe("applyReferralActivation — the referrer's reward (gated on real usage)", () => {
  it("rewards the referrer once when the referee activates, and not twice", async () => {
    const referrer = await upsertLead({ email: "rr@test.sg" });
    const code = await getReferralCode(referrer);
    const referee = await upsertLead({ email: "ee@test.sg" });
    await attachReferral(referee, code);

    await applyReferralActivation(referee);
    await applyReferralActivation(referee); // idempotent

    const stats = await getReferralStats(referrer);
    expect(stats.rewarded).toBe(1);
    expect(stats.earnedReadings).toBe(REFERRAL_REWARD);
    expect((await getCredits(referrer)).bonusReadings).toBe(REFERRAL_REWARD);
  });

  it("does nothing for a lead with no referrer", async () => {
    const solo = await upsertLead({ email: "solo@test.sg" });
    await applyReferralActivation(solo);
    expect((await getCredits(solo)).bonusReadings).toBe(0);
  });

  it("stops rewarding past MAX_REWARDED_REFERRALS", async () => {
    const referrer = await upsertLead({ email: "cap@test.sg" });
    const code = await getReferralCode(referrer);

    for (let i = 0; i < MAX_REWARDED_REFERRALS + 3; i++) {
      const referee = await upsertLead({ email: `cap${i}@test.sg` });
      await attachReferral(referee, code);
      await applyReferralActivation(referee);
    }

    const stats = await getReferralStats(referrer);
    expect(stats.rewarded).toBe(MAX_REWARDED_REFERRALS);
    expect(stats.earnedReadings).toBe(MAX_REWARDED_REFERRALS * REFERRAL_REWARD);
  });
});
