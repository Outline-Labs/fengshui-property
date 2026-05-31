import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
