import "server-only";

import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";

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

const OTP_TTL_MS = 10 * 60 * 1000;
// Brute-force guard: after this many wrong guesses the code is invalidated and
// the lead must request a fresh one. The OTP is the anti-fraud keystone, so it
// must not be guessable by hammering a fixed 6-digit code.
const OTP_MAX_ATTEMPTS = 5;

export function normalizeSgMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^65/, "");
  return /^[89]\d{7}$/.test(digits) ? digits : null;
}

async function sendSms(phone: string, message: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    // Dev fallback: log instead of sending an SMS.
    console.log(`[SMS dev] +65 ${phone}: ${message}`);
    return;
  }

  const body = new URLSearchParams({
    To: `+65${phone}`,
    From: from,
    Body: message,
  });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
  } catch {
    // best-effort; the user can re-request a code
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
  // CSPRNG, not Math.random — this is a security token. padStart keeps
  // leading-zero codes (e.g. "004217") valid and the space uniform.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db
    .update(leads)
    .set({
      phone,
      otpCode: code,
      otpExpiresAt: Date.now() + OTP_TTL_MS,
      otpAttempts: 0,
      updatedAt: Date.now(),
    })
    .where(eq(leads.id, leadId));
  await sendSms(phone, `Your Fengshui AI verification code is ${code}`);
  return process.env.NODE_ENV === "production"
    ? { ok: true }
    : { ok: true, devCode: code };
}

export async function verifyOtpAndRequestAgent(
  leadId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureSchema();
  const lead = await getLead(leadId);
  if (!lead) return { ok: false, error: "Session expired — please refresh." };
  if (!lead.otpCode || !lead.otpExpiresAt || Date.now() > lead.otpExpiresAt) {
    return { ok: false, error: "That code has expired. Request a new one." };
  }
  if (code.trim() !== lead.otpCode) {
    const attempts = (lead.otpAttempts ?? 0) + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      // Lock out: clear the code so further guesses fail and a new SMS is
      // required, resetting the attacker's budget to zero.
      await db
        .update(leads)
        .set({
          otpCode: null,
          otpExpiresAt: null,
          otpAttempts: attempts,
          updatedAt: Date.now(),
        })
        .where(eq(leads.id, leadId));
      return { ok: false, error: "Too many attempts. Request a new code." };
    }
    await db
      .update(leads)
      .set({ otpAttempts: attempts, updatedAt: Date.now() })
      .where(eq(leads.id, leadId));
    return { ok: false, error: "That code doesn't match." };
  }
  await db
    .update(leads)
    .set({
      phoneVerified: 1,
      wantsAgent: 1,
      verifiedAt: Date.now(),
      otpCode: null,
      otpExpiresAt: null,
      otpAttempts: 0,
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
  const quota = computeQuota(lead);
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
  quota: number;
  used: number;
  remaining: number;
};

export async function getCredits(leadId: string): Promise<Credits> {
  const lead = await getLead(leadId);
  if (!lead) return { lead: null, quota: 0, used: 0, remaining: 0 };
  const quota = computeQuota(lead);
  const rows = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(eq(analyses.leadId, leadId));
  const used = rows.length;
  return { lead, quota, used, remaining: Math.max(0, quota - used) };
}
