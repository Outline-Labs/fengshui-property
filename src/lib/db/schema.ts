import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leads = sqliteTable("leads", {
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
  // Legacy: OTP codes were stored here when we managed them ourselves. Twilio
  // Verify now owns the code lifecycle, so these are unused — kept to avoid a
  // destructive migration on existing databases.
  otpCode: text("otp_code"),
  otpExpiresAt: integer("otp_expires_at"),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  kind: text("kind").notNull(),
  facing: text("facing"),
  score: real("score"),
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
// `ref` is the idempotency key — the Stripe Checkout Session id for top-ups
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

export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().unique(), // FCFS — a lead is claimed once
  agentId: text("agent_id").notNull(),
  tier: text("tier").notNull(),
  priceCents: integer("price_cents").notNull(),
  claimedAt: integer("claimed_at").notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
