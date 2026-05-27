import "server-only";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";

import { db, ensureSchema } from "./db";
import {
  type Agent,
  type Lead,
  agents,
  analyses,
  claims,
  leads,
} from "./db/schema";

// One tier: a verified buyer inquiry (OTP-verified phone + asked for an agent).
export const VERIFIED_PRICE_CENTS = 8800; // S$88

export function sgd(cents: number): string {
  return `S$${(cents / 100).toFixed(0)}`;
}

const clean = (v?: string | null) => {
  const t = v?.trim();
  return t ? t : null;
};

export async function applyAgent(p: {
  email: string;
  name?: string;
  agency?: string;
  resNo?: string;
  territories?: string;
  referredBy?: string;
  approved: boolean;
}): Promise<void> {
  await ensureSchema();
  const email = p.email.trim().toLowerCase();
  const status = p.approved ? "approved" : "pending";

  const existing = await db
    .select()
    .from(agents)
    .where(eq(agents.email, email))
    .limit(1);

  if (existing[0]) {
    const cur = existing[0];
    await db
      .update(agents)
      .set({
        name: clean(p.name) ?? cur.name,
        agency: clean(p.agency) ?? cur.agency,
        resNo: clean(p.resNo) ?? cur.resNo,
        territories: clean(p.territories) ?? cur.territories,
        status: cur.status === "approved" ? "approved" : status,
      })
      .where(eq(agents.id, cur.id));
    return;
  }

  await db.insert(agents).values({
    id: crypto.randomUUID(),
    email,
    name: clean(p.name),
    agency: clean(p.agency),
    resNo: clean(p.resNo),
    territories: clean(p.territories),
    status,
    referredBy: clean(p.referredBy),
    createdAt: Date.now(),
  });
}

export async function getApprovedAgentByEmail(
  email: string,
): Promise<Agent | null> {
  await ensureSchema();
  const r = await db
    .select()
    .from(agents)
    .where(eq(agents.email, email.trim().toLowerCase()))
    .limit(1);
  const a = r[0];
  return a && a.status === "approved" ? a : null;
}

export async function getAgent(id: string): Promise<Agent | null> {
  await ensureSchema();
  const r = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return r[0] ?? null;
}

async function leadStats(): Promise<Map<string, { count: number; top: number | null }>> {
  const rows = await db
    .select({ leadId: analyses.leadId, score: analyses.score })
    .from(analyses);
  const map = new Map<string, { count: number; top: number | null }>();
  for (const r of rows) {
    const cur = map.get(r.leadId) ?? { count: 0, top: null };
    cur.count += 1;
    if (r.score != null && (cur.top == null || r.score > cur.top)) {
      cur.top = r.score;
    }
    map.set(r.leadId, cur);
  }
  return map;
}

export type MarketLead = {
  id: string;
  priceCents: number;
  propertyInterest: string | null;
  timeline: string | null;
  createdAt: number;
  verifiedAt: number | null;
  analysisCount: number;
  topScore: number | null;
};

export async function listAvailableLeads(): Promise<MarketLead[]> {
  await ensureSchema();
  const claimedRows = await db.select({ leadId: claims.leadId }).from(claims);
  const claimed = new Set(claimedRows.map((c) => c.leadId));
  const all = await db.select().from(leads);
  const stats = await leadStats();

  const out: MarketLead[] = [];
  for (const l of all) {
    // Sellable only once OTP-verified AND they asked for an agent.
    if (l.phoneVerified !== 1 || l.wantsAgent !== 1 || claimed.has(l.id)) {
      continue;
    }
    const s = stats.get(l.id) ?? { count: 0, top: null };
    out.push({
      id: l.id,
      priceCents: VERIFIED_PRICE_CENTS,
      propertyInterest: l.propertyInterest,
      timeline: l.timeline,
      createdAt: l.createdAt,
      verifiedAt: l.verifiedAt,
      analysisCount: s.count,
      topScore: s.top,
    });
  }
  out.sort((a, b) => (b.verifiedAt ?? b.createdAt) - (a.verifiedAt ?? a.createdAt));
  return out;
}

export async function claimLead(
  agentId: string,
  leadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureSchema();
  const lr = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  const lead = lr[0];
  if (!lead || lead.phoneVerified !== 1 || lead.wantsAgent !== 1) {
    return { ok: false, error: "That lead is no longer available." };
  }
  const existing = await db
    .select({ id: claims.id })
    .from(claims)
    .where(eq(claims.leadId, leadId))
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: "Another agent claimed this lead first." };
  }
  try {
    await db.insert(claims).values({
      id: crypto.randomUUID(),
      leadId,
      agentId,
      tier: "verified",
      priceCents: VERIFIED_PRICE_CENTS,
      claimedAt: Date.now(),
    });
  } catch {
    return { ok: false, error: "Another agent claimed this lead first." };
  }
  return { ok: true };
}

export type MyClaim = {
  leadId: string;
  tier: string;
  priceCents: number;
  claimedAt: number;
  email: string;
  name: string | null;
  phone: string | null;
  propertyInterest: string | null;
  timeline: string | null;
  readings: number;
  bestScore: number | null;
};

export async function listMyClaims(agentId: string): Promise<MyClaim[]> {
  await ensureSchema();
  const cs = await db.select().from(claims).where(eq(claims.agentId, agentId));
  const stats = await leadStats();
  const out: MyClaim[] = [];
  for (const c of cs) {
    const lr = await db.select().from(leads).where(eq(leads.id, c.leadId)).limit(1);
    const l = lr[0];
    if (!l) continue;
    const s = stats.get(c.leadId) ?? { count: 0, top: null };
    out.push({
      leadId: c.leadId,
      tier: c.tier,
      priceCents: c.priceCents,
      claimedAt: c.claimedAt,
      email: l.email,
      name: l.name,
      phone: l.phone,
      propertyInterest: l.propertyInterest,
      timeline: l.timeline,
      readings: s.count,
      bestScore: s.top,
    });
  }
  out.sort((a, b) => b.claimedAt - a.claimedAt);
  return out;
}

function fmtPhone(p: string | null): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "").replace(/^65/, "");
  return /^[89]\d{7}$/.test(d) ? `+65 ${d}` : p;
}

export type ExportRow = {
  name: string;
  phone: string;
  email: string;
  propertyInterest: string;
  timeline: string;
  readings: string;
  bestScore: string;
  claimedDate: string;
};

export async function getClaimsForExport(agentId: string): Promise<ExportRow[]> {
  await ensureSchema();
  const cs = (
    await db.select().from(claims).where(eq(claims.agentId, agentId))
  ).sort((a, b) => b.claimedAt - a.claimedAt);
  const stats = await leadStats();
  const out: ExportRow[] = [];
  for (const c of cs) {
    const lr = await db.select().from(leads).where(eq(leads.id, c.leadId)).limit(1);
    const l = lr[0];
    if (!l) continue;
    const s = stats.get(c.leadId) ?? { count: 0, top: null };
    out.push({
      name: l.name ?? "",
      phone: fmtPhone(l.phone),
      email: l.email,
      propertyInterest: l.propertyInterest ?? "",
      timeline: l.timeline ?? "",
      readings: String(s.count),
      bestScore: s.top != null ? `${s.top.toFixed(1)}/10` : "",
      claimedDate: new Date(c.claimedAt).toISOString().slice(0, 10),
    });
  }
  return out;
}

export type ClaimedLeadDetail = {
  tier: string;
  priceCents: number;
  claimedAt: number;
  lead: Lead;
  analyses: { facing: string | null; score: number | null; createdAt: number }[];
};

export async function getClaimedLeadDetail(
  agentId: string,
  leadId: string,
): Promise<ClaimedLeadDetail | null> {
  await ensureSchema();
  const cr = await db
    .select()
    .from(claims)
    .where(eq(claims.leadId, leadId))
    .limit(1);
  const claim = cr[0];
  if (!claim || claim.agentId !== agentId) return null;
  const lr = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  const lead = lr[0];
  if (!lead) return null;
  const ar = await db.select().from(analyses).where(eq(analyses.leadId, leadId));
  return {
    tier: claim.tier,
    priceCents: claim.priceCents,
    claimedAt: claim.claimedAt,
    lead,
    analyses: ar
      .map((a) => ({ facing: a.facing, score: a.score, createdAt: a.createdAt }))
      .sort((x, y) => y.createdAt - x.createdAt),
  };
}
