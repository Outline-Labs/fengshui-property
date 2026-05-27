import "server-only";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";

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

export async function recordAnalysis(
  leadId: string,
  kind: string,
  facing: string,
  score: number,
): Promise<void> {
  await ensureSchema();
  await db.insert(analyses).values({
    id: crypto.randomUUID(),
    leadId,
    kind,
    facing,
    score,
    createdAt: Date.now(),
  });
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
