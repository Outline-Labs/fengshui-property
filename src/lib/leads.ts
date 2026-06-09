import "server-only";

import crypto from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";

import { db, ensureSchema } from "./db";
import { analyses, type Lead, leads } from "./db/schema";
import { computeQuota } from "./quota";

export type LeadProfile = {
  email: string;
  name?: string | null;
  phone?: string | null;
  propertyInterest?: string | null;
  timeline?: string | null;
};

const clean = (v?: string | null) => {
  const t = v?.trim();
  return t ? t : null;
};

export async function upsertLead(p: LeadProfile): Promise<string> {
  await ensureSchema();
  const email = p.email.trim().toLowerCase();
  const now = Date.now();

  const existing = await db
    .select()
    .from(leads)
    .where(eq(leads.email, email))
    .limit(1);

  if (existing[0]) {
    const cur = existing[0];
    await db
      .update(leads)
      .set({
        name: clean(p.name) ?? cur.name,
        phone: clean(p.phone) ?? cur.phone,
        propertyInterest: clean(p.propertyInterest) ?? cur.propertyInterest,
        timeline: clean(p.timeline) ?? cur.timeline,
        updatedAt: now,
      })
      .where(eq(leads.id, cur.id));
    return cur.id;
  }

  const id = crypto.randomUUID();
  await db.insert(leads).values({
    id,
    email,
    name: clean(p.name),
    phone: clean(p.phone),
    propertyInterest: clean(p.propertyInterest),
    timeline: clean(p.timeline),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function getLead(id: string): Promise<Lead | null> {
  await ensureSchema();
  const r = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return r[0] ?? null;
}

/** Find a lead by (normalized) email — the entry point for passwordless login. */
export async function getLeadByEmail(email: string): Promise<Lead | null> {
  await ensureSchema();
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const r = await db.select().from(leads).where(eq(leads.email, e)).limit(1);
  return r[0] ?? null;
}

/** Mark a lead's email as verified (set when they consume a magic link). */
export async function markEmailVerified(leadId: string): Promise<void> {
  await ensureSchema();
  const now = Date.now();
  await db
    .update(leads)
    .set({ emailVerified: 1, emailVerifiedAt: now, updatedAt: now })
    .where(eq(leads.id, leadId));
}

export function normalizeSgMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^65/, "");
  return /^[89]\d{7}$/.test(digits) ? digits : null;
}

// Twilio Verify owns the OTP lifecycle (code generation, delivery, expiry,
// attempt limits, and SG sender provisioning). We only start a verification
// and check the user's code against it — we never store the code ourselves.
const VERIFY_BASE = "https://verify.twilio.com/v2";

function verifyConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID;
  return sid && token && service ? { sid, token, service } : null;
}

function verifyAuthHeader(sid: string, token: string): string {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

/**
 * Start an SMS verification. Without Twilio creds we fall back to a fixed dev
 * code ("000000") so local/test flows work offline — but NEVER in production,
 * where a missing config must fail closed rather than accept a bypass code.
 */
async function startVerification(
  phone: string,
): Promise<{ ok: boolean; devCode?: string }> {
  const cfg = verifyConfig();
  if (!cfg) {
    if (process.env.NODE_ENV === "production") return { ok: false };
    console.log(`[OTP dev] +65 ${phone}: use code 000000`);
    return { ok: true, devCode: "000000" };
  }
  try {
    const res = await fetch(`${VERIFY_BASE}/Services/${cfg.service}/Verifications`, {
      method: "POST",
      headers: {
        Authorization: verifyAuthHeader(cfg.sid, cfg.token),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: `+65${phone}`, Channel: "sms" }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

/** Check a user-entered code; true only when Twilio marks it "approved". */
async function checkVerification(phone: string, code: string): Promise<boolean> {
  const cfg = verifyConfig();
  if (!cfg) {
    return process.env.NODE_ENV !== "production" && code.trim() === "000000";
  }
  try {
    const res = await fetch(
      `${VERIFY_BASE}/Services/${cfg.service}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: verifyAuthHeader(cfg.sid, cfg.token),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: `+65${phone}`, Code: code.trim() }),
      },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "approved";
  } catch {
    return false;
  }
}

export type OtpResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: string };

export async function requestOtp(
  leadId: string,
  rawPhone: string,
): Promise<OtpResult> {
  await ensureSchema();
  const phone = normalizeSgMobile(rawPhone);
  if (!phone) {
    return { ok: false, error: "Enter a valid Singapore mobile number." };
  }
  // Persist the phone so the check targets the same number; Twilio Verify
  // holds the code.
  await db
    .update(leads)
    .set({ phone, updatedAt: Date.now() })
    .where(eq(leads.id, leadId));
  const started = await startVerification(phone);
  if (!started.ok) {
    return { ok: false, error: "Couldn't send a code right now. Please try again." };
  }
  return started.devCode ? { ok: true, devCode: started.devCode } : { ok: true };
}

export async function verifyOtpAndRequestAgent(
  leadId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureSchema();
  const lead = await getLead(leadId);
  if (!lead) return { ok: false, error: "Session expired — please refresh." };
  if (!lead.phone) {
    return { ok: false, error: "Request a code first." };
  }
  const approved = await checkVerification(lead.phone, code);
  if (!approved) {
    return {
      ok: false,
      error: "That code is incorrect or expired. Request a new one if needed.",
    };
  }
  await db
    .update(leads)
    .set({
      phoneVerified: 1,
      wantsAgent: 1,
      verifiedAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(eq(leads.id, leadId));
  return { ok: true };
}

export type ReserveResult =
  | { ok: true; id: string; remaining: number }
  | { ok: false; reason: "no_session" | "out_of_credits" };

/**
 * Atomically claim one reading credit. The conditional INSERT ... WHERE
 * (count < quota) is a single statement, so concurrent uploads can't both pass
 * a check-then-insert window and overspend the quota (each upload is a paid
 * Kimi call). Returns the reservation id to finalize() or release().
 */
export async function reserveReading(
  leadId: string,
  kind = "floor_plan",
): Promise<ReserveResult> {
  await ensureSchema();
  const lead = await getLead(leadId);
  if (!lead) return { ok: false, reason: "no_session" };
  // Effective allowance = profile-based free quota + credits earned/bought.
  const quota = computeQuota(lead) + lead.bonusReadings;
  const id = crypto.randomUUID();
  const now = Date.now();

  const res = await db.run(sql`
    INSERT INTO analyses (id, lead_id, kind, facing, score, created_at)
    SELECT ${id}, ${leadId}, ${kind}, NULL, NULL, ${now}
    WHERE (SELECT COUNT(*) FROM analyses WHERE lead_id = ${leadId}) < ${quota}
  `);
  if (res.rowsAffected !== 1) return { ok: false, reason: "out_of_credits" };

  const used = (
    await db.select({ id: analyses.id }).from(analyses).where(eq(analyses.leadId, leadId))
  ).length;
  return { ok: true, id, remaining: Math.max(0, quota - used) };
}

/** Record the result onto a reserved reading once the analysis succeeds. */
export async function finalizeReading(
  id: string,
  facing: string,
  score: number,
): Promise<void> {
  await ensureSchema();
  await db.update(analyses).set({ facing, score }).where(eq(analyses.id, id));
}

/** Refund a reserved reading when the analysis fails, freeing the credit. */
export async function releaseReading(id: string): Promise<void> {
  await ensureSchema();
  await db.delete(analyses).where(eq(analyses.id, id));
}

export type Credits = {
  lead: Lead | null;
  quota: number; // total allowance = freeQuota + bonusReadings
  freeQuota: number; // profile-based free readings
  bonusReadings: number; // readings earned (referrals) or bought (packs)
  used: number;
  remaining: number;
};

/**
 * How many floor-plan (vision-billed) readings have been reserved since `since`
 * (epoch ms), across all leads — the input to the global daily spend ceiling.
 */
export async function floorPlanReadingsSince(since: number): Promise<number> {
  await ensureSchema();
  const r = await db
    .select({ n: sql<number>`count(*)` })
    .from(analyses)
    .where(and(eq(analyses.kind, "floor_plan"), gte(analyses.createdAt, since)));
  return Number(r[0]?.n ?? 0);
}

export async function getCredits(leadId: string): Promise<Credits> {
  const lead = await getLead(leadId);
  if (!lead) {
    return { lead: null, quota: 0, freeQuota: 0, bonusReadings: 0, used: 0, remaining: 0 };
  }
  const freeQuota = computeQuota(lead);
  const bonusReadings = lead.bonusReadings;
  const quota = freeQuota + bonusReadings;
  const rows = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(eq(analyses.leadId, leadId));
  const used = rows.length;
  return {
    lead,
    quota,
    freeQuota,
    bonusReadings,
    used,
    remaining: Math.max(0, quota - used),
  };
}
