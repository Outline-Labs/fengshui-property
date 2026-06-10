import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name"),
    phone: text("phone"),
    propertyInterest: text("property_interest"),
    timeline: text("timeline"),
    // Verification: a lead is only sellable once the phone is OTP-verified AND
    // they've explicitly asked to be matched with an agent.
    phoneVerified: integer("phone_verified").notNull().default(0),
    wantsAgent: integer("wants_agent").notNull().default(0),
    verifiedAt: integer("verified_at"),
    // Email-ownership verification via passwordless magic link. Separate from the
    // phone verification above; gates login on a new device + credit purchases.
    emailVerified: integer("email_verified").notNull().default(0),
    emailVerifiedAt: integer("email_verified_at"),
    // Consumer reading credits beyond the profile-based free quota: readings
    // earned by referring friends or bought as a pack. The effective allowance
    // is computeQuota(profile) + bonusReadings; only ever bumped atomically
    // alongside a reading_grants ledger row via db.batch (see lib/credits.ts).
    bonusReadings: integer("bonus_readings").notNull().default(0),
    // Each lead's own shareable referral code, and the code they signed up
    // under. referralActivated flips to 1 once this lead completes a reading,
    // which is what releases their referrer's reward (gated on real usage, not
    // a bare signup, so codes can't be farmed).
    referralCode: text("referral_code"),
    referredBy: text("referred_by"),
    referralActivated: integer("referral_activated").notNull().default(0),
    // Legacy: OTP codes were stored here when we managed them ourselves. Twilio
    // Verify now owns the code lifecycle, so these are unused — kept to avoid a
    // destructive migration on existing databases.
    otpCode: text("otp_code"),
    otpExpiresAt: integer("otp_expires_at"),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    // SQLite forbids ADD COLUMN ... UNIQUE, so referral-code uniqueness is a
    // standalone unique index (multiple NULLs allowed). Mirrors the raw DDL in
    // db/index.ts.
    uniqueIndex("idx_leads_referral_code").on(t.referralCode),
  ],
);

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  kind: text("kind").notNull(),
  facing: text("facing"),
  score: real("score"),
  createdAt: integer("created_at").notNull(),
});

// Content-addressed cache of a completed floor-plan reading, keyed by a hash of
// (image data URL + facing + year). The same upload returns the same reading
// instead of re-running the non-deterministic vision model — so a re-upload of
// the same plan scores identically, and we don't re-bill an identical read.
export const readingCache = sqliteTable("reading_cache", {
  key: text("key").primaryKey(), // sha256(dataUrl|facing|year)
  analysis: text("analysis").notNull(), // JSON FloorPlanAnalysis
  createdAt: integer("created_at").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  agency: text("agency"),
  resNo: text("res_no"),
  territories: text("territories"),
  status: text("status").notNull(), // pending | approved | suspended
  referredBy: text("referred_by"),
  // Pre-funded wallet balance (cents). The fast atomic gate for claims; the
  // append-only wallet_transactions ledger is the source of truth. Only ever
  // mutated atomically alongside a ledger row via db.batch (see lib/wallet.ts).
  balanceCents: integer("balance_cents").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (t) => [
  // Load-bearing: an unconditional debit (balance - price) violates this when
  // funds are short, which aborts the claim's db.batch and rolls it back. This
  // is the money guard — keep it in sync with the raw DDL in db/index.ts.
  check("agents_balance_non_negative", sql`${t.balanceCents} >= 0`),
]);

// Append-only wallet ledger: top-ups (+), claim debits (−), and refunds.
// `ref` is the idempotency key — the payment processor's order id for top-ups
// (so a redelivered webhook credits once) and the claim id for debits (so a
// retried claim can't double-charge). `balanceAfter` snapshots the cached
// balance for independent reconciliation against agents.balance_cents.
export const walletTransactions = sqliteTable("wallet_transactions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  amountCents: integer("amount_cents").notNull(), // +credit / −debit
  kind: text("kind").notNull(), // topup | claim_debit | refund
  ref: text("ref").notNull().unique(),
  balanceAfter: integer("balance_after").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Append-only consumer reading-credit ledger: referral rewards/bonuses (+) and
// pack purchases (+). The lead-side mirror of wallet_transactions. `ref` is the
// idempotency key — the Revolut order id for purchases (so a redelivered
// webhook grants once), `referral:<refereeId>` for a referrer's
// reward (one per referee), `referee:<leadId>` for the signup bonus.
// `balanceAfter` snapshots leads.bonus_readings for reconciliation.
export const readingGrants = sqliteTable("reading_grants", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  amount: integer("amount").notNull(), // readings granted (always > 0)
  kind: text("kind").notNull(), // referral_reward | referee_bonus | purchase
  ref: text("ref").notNull().unique(),
  balanceAfter: integer("balance_after").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().unique(), // FCFS — a lead is claimed once
  agentId: text("agent_id").notNull(),
  tier: text("tier").notNull(),
  priceCents: integer("price_cents").notNull(),
  claimedAt: integer("claimed_at").notNull(),
});

// Plan-independent fixed-window rate limiter (Vercel Firewall rate limiting needs
// a paid plan; this works on any tier). One row per (key, window) — e.g.
// `signup:<ip>` / `reading:<ip>` — incremented per request; allowed while the
// window's count stays within the caller's limit. See lib/rate-limit.ts.
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: integer("window_start").notNull(), // epoch ms, floored to window
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// Single-use guard for passwordless magic links: the sha256 of a consumed
// login/verify token. readLoginToken validates signature + TTL, but the token is
// otherwise stateless and replayable for its whole 15-min life. Consuming a
// token inserts its hash here, so a replay of the same emailed link (forwarded,
// logged, mail-scanner-prefetched) collides on the PK and is rejected. Rows are
// only meaningful for the token TTL. See lib/used-tokens.ts.
export const usedTokens = sqliteTable("used_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  usedAt: integer("used_at").notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type ReadingGrant = typeof readingGrants.$inferSelect;
export type RateLimit = typeof rateLimits.$inferSelect;
