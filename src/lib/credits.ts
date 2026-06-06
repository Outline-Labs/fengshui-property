import "server-only";

import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { db, ensureSchema } from "./db";
import { type Lead, leads, readingGrants } from "./db/schema";
import { isUniqueViolation } from "./wallet";

// ── Tunable economics ──────────────────────────────────────────────────────
// These are product knobs, not fengshui — change freely as the funnel teaches
// us what converts. A "reading" costs us roughly one Kimi call, so referral
// rewards are cheap fuel; the cap bounds the giveaway per user.
export const REFERRAL_REWARD = 3; // readings the referrer earns per activated referee
export const REFEREE_BONUS = 1; // readings a new user gets for joining via a link
export const MAX_REWARDED_REFERRALS = 10; // ⇒ at most 30 free readings from referrals

export type GrantKind = "referral_reward" | "referee_bonus" | "purchase";

function generateReferralCode(): string {
  // 8 uppercase hex chars — short enough to share, wide enough (4.3B) that
  // collisions are vanishingly rare; the unique index + retry covers them.
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function loadLead(leadId: string): Promise<Lead | null> {
  const r = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  return r[0] ?? null;
}

async function bonusReadingsOf(leadId: string): Promise<number> {
  const r = await db
    .select({ b: leads.bonusReadings })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  return r[0]?.b ?? 0;
}

/**
 * The lead's stable, shareable referral code. Minted lazily on first read and
 * persisted, so it only exists for leads who actually open their invite. The
 * conditional UPDATE (… WHERE referral_code IS NULL) makes concurrent first
 * reads converge on one code; a code collision (unique index) just retries.
 */
export async function getReferralCode(leadId: string): Promise<string> {
  await ensureSchema();
  const lead = await loadLead(leadId);
  if (!lead) throw new Error(`getReferralCode: unknown lead ${leadId}`);
  if (lead.referralCode) return lead.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const res = await db.run(sql`
        UPDATE leads SET referral_code = ${code}, updated_at = ${Date.now()}
        WHERE id = ${leadId} AND referral_code IS NULL
      `);
      if (res.rowsAffected === 1) return code;
      // A concurrent call won the race — read its code back.
      const again = await loadLead(leadId);
      if (again?.referralCode) return again.referralCode;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Code collided with another lead; loop with a fresh one.
    }
  }
  throw new Error("getReferralCode: could not allocate a unique code");
}

/** Whether a referral code maps to a real referrer (for showing invite UI). */
export async function referralCodeExists(rawCode: string): Promise<boolean> {
  await ensureSchema();
  const code = rawCode.trim().toUpperCase();
  if (!code) return false;
  const r = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.referralCode, code))
    .limit(1);
  return Boolean(r[0]);
}

export type GrantResult = { deduped: boolean; bonusReadings: number };

/**
 * Credit reading(s) to a lead. `ref` is the idempotency key — the Stripe
 * session id for a purchase, `referee:<leadId>` for a signup bonus,
 * `referral:<refereeId>` for a referrer's reward. The ledger insert and the
 * bonus_readings bump run in one atomic db.batch; UNIQUE(ref) aborts (and rolls
 * back) a duplicate, in which case we report `deduped` and leave the count be.
 * Mirrors lib/wallet.creditWallet — same proven pattern, readings instead of cents.
 */
export async function grantReadings(p: {
  leadId: string;
  amount: number;
  kind: GrantKind;
  ref: string;
}): Promise<GrantResult> {
  await ensureSchema();
  if (!Number.isInteger(p.amount) || p.amount <= 0) {
    throw new Error(`grantReadings: invalid amount ${p.amount}`);
  }
  const exists = await loadLead(p.leadId);
  if (!exists) throw new Error(`grantReadings: unknown lead ${p.leadId}`);

  const now = Date.now();
  try {
    await db.batch([
      // Ledger first: its UNIQUE(ref) is the dedupe gate, so a duplicate aborts
      // the batch before bonus_readings is touched. balance_after is the
      // post-grant count, matching the UPDATE that follows.
      db.insert(readingGrants).values({
        id: crypto.randomUUID(),
        leadId: p.leadId,
        amount: p.amount,
        kind: p.kind,
        ref: p.ref,
        balanceAfter: sql`(SELECT ${leads.bonusReadings} FROM ${leads} WHERE ${leads.id} = ${p.leadId}) + ${p.amount}`,
        createdAt: now,
      }),
      db
        .update(leads)
        .set({
          bonusReadings: sql`${leads.bonusReadings} + ${p.amount}`,
          updatedAt: now,
        })
        .where(eq(leads.id, p.leadId)),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { deduped: true, bonusReadings: await bonusReadingsOf(p.leadId) };
    }
    throw e;
  }
  return { deduped: false, bonusReadings: await bonusReadingsOf(p.leadId) };
}

/**
 * Attach a referral at signup: record who referred the new lead and credit them
 * the referee bonus. No-ops on a self-referral, an unknown code, or a lead
 * who's already been referred (so it's safe to call on every signup submit).
 */
export async function attachReferral(
  refereeLeadId: string,
  rawCode: string,
): Promise<void> {
  await ensureSchema();
  const code = rawCode.trim().toUpperCase();
  if (!code) return;

  const referee = await loadLead(refereeLeadId);
  if (!referee || referee.referredBy) return; // already attached / unknown

  const referrerRows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.referralCode, code))
    .limit(1);
  const referrer = referrerRows[0];
  if (!referrer || referrer.id === referee.id) return; // unknown code / self

  await db
    .update(leads)
    .set({ referredBy: code, updatedAt: Date.now() })
    .where(and(eq(leads.id, referee.id), sql`${leads.referredBy} IS NULL`));

  await grantReadings({
    leadId: referee.id,
    amount: REFEREE_BONUS,
    kind: "referee_bonus",
    ref: `referee:${referee.id}`,
  });
}

/**
 * Release a referrer's reward once their referee actually completes a reading —
 * the anti-farming gate (a bare signup earns nothing). Idempotent: flips the
 * referee's referralActivated flag first and keys the grant on the referee id,
 * so repeated calls (every reading) reward at most once. Honours the per-referrer
 * cap.
 */
export async function applyReferralActivation(
  refereeLeadId: string,
): Promise<void> {
  await ensureSchema();
  const referee = await loadLead(refereeLeadId);
  if (!referee || referee.referralActivated) return;

  // Mark first so concurrent/later reads short-circuit; the grant's UNIQUE(ref)
  // is the real double-reward guard.
  await db
    .update(leads)
    .set({ referralActivated: 1, updatedAt: Date.now() })
    .where(eq(leads.id, referee.id));

  if (!referee.referredBy) return;
  const referrerRows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.referralCode, referee.referredBy))
    .limit(1);
  const referrer = referrerRows[0];
  if (!referrer) return;

  const rewarded = await db
    .select({ id: readingGrants.id })
    .from(readingGrants)
    .where(
      and(
        eq(readingGrants.leadId, referrer.id),
        eq(readingGrants.kind, "referral_reward"),
      ),
    );
  if (rewarded.length >= MAX_REWARDED_REFERRALS) return;

  await grantReadings({
    leadId: referrer.id,
    amount: REFERRAL_REWARD,
    kind: "referral_reward",
    ref: `referral:${referee.id}`,
  });
}

export type ReferralStats = {
  code: string;
  rewarded: number; // referees who activated and earned this lead a reward
  earnedReadings: number; // total readings earned from referrals
};

export async function getReferralStats(leadId: string): Promise<ReferralStats> {
  await ensureSchema();
  const code = await getReferralCode(leadId);
  const rows = await db
    .select({ amount: readingGrants.amount })
    .from(readingGrants)
    .where(
      and(
        eq(readingGrants.leadId, leadId),
        eq(readingGrants.kind, "referral_reward"),
      ),
    );
  return {
    code,
    rewarded: rows.length,
    earnedReadings: rows.reduce((sum, r) => sum + r.amount, 0),
  };
}
