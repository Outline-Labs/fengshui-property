import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  type MarketLead,
  type MyClaim,
  getAgent,
  listAvailableLeads,
  listMyClaims,
  sgd,
} from "@/lib/agents";
import { getAgentId } from "@/lib/session";

import { agentLogout, claimAction } from "./actions";

export const metadata: Metadata = {
  title: "Dashboard · Fengshui AI Partners",
  robots: { index: false, follow: false },
};

function ago(ts: number): string {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const agentId = await getAgentId();
  if (!agentId) redirect("/login");
  const agent = await getAgent(agentId);
  if (!agent) redirect("/login");

  const { error } = await searchParams;
  const [leads, claims] = await Promise.all([
    listAvailableLeads(),
    listMyClaims(agentId),
  ]);
  const spent = claims.reduce((s, c) => s + c.priceCents, 0);

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-6 sm:px-10 py-12 sm:py-16">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-bg/15 pb-6 mb-10">
          <div>
            <div className="text-[10px] tracking-[0.35em] uppercase text-bg/50 mb-2">
              Partner dashboard
            </div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-[-0.02em]">
              {agent.name ?? "Welcome"}
            </h1>
            <div className="text-sm text-bg/60 mt-1">
              {agent.agency ?? "—"}
              {agent.territories ? ` · ${agent.territories}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-right">
              <div className="numeral text-2xl text-cinnabar">{sgd(spent)}</div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50">
                {claims.length} claimed
              </div>
            </div>
            <form action={agentLogout}>
              <button className="text-xs text-bg/60 hover:text-bg transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </header>

        {error === "taken" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mb-8 text-sm">
            Another agent claimed that lead first — it moves fast.
          </div>
        )}

        <section className="mb-16">
          <div className="flex items-baseline justify-between border-b border-bg/15 pb-3 mb-6">
            <h2 className="font-display text-2xl tracking-tight">
              Available leads
            </h2>
            <span className="text-[10px] tracking-[0.3em] uppercase text-bg/50">
              First to claim · exclusive · 24h to contact
            </span>
          </div>
          {leads.length === 0 ? (
            <p className="text-bg/60 text-sm py-8">
              No leads available right now. Fresh buyers appear here as they
              request a specialist — check back soon.
            </p>
          ) : (
            <ul className="space-y-3">
              {leads.map((l) => (
                <LeadRow key={l.id} lead={l} ago={ago(l.verifiedAt ?? l.createdAt)} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between border-b border-bg/15 pb-3 mb-6">
            <h2 className="font-display text-2xl tracking-tight">Your claims</h2>
            <div className="flex items-center gap-5">
              {claims.length > 0 && (
                <a
                  href="/export"
                  className="text-[11px] tracking-[0.2em] uppercase text-cinnabar hover:opacity-80"
                >
                  Export CSV ↓
                </a>
              )}
              <span className="text-[10px] tracking-[0.3em] uppercase text-bg/50">
                {claims.length}
              </span>
            </div>
          </div>
          {claims.length === 0 ? (
            <p className="text-bg/60 text-sm py-8">
              Nothing claimed yet. Claimed leads unlock the buyer&rsquo;s contact
              and pitch package.
            </p>
          ) : (
            <ul className="divide-y divide-bg/10">
              {claims.map((c) => (
                <ClaimRow key={c.leadId} claim={c} ago={ago(c.claimedAt)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function LeadRow({ lead, ago }: { lead: MarketLead; ago: string }) {
  const readings =
    lead.analysisCount > 0
      ? ` · ${lead.analysisCount} reading${lead.analysisCount > 1 ? "s" : ""}${
          lead.topScore != null ? ` · best ${lead.topScore.toFixed(1)}/10` : ""
        }`
      : "";
  return (
    <li className="border border-bg/15 hover:border-bg/30 transition-colors p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[10px] tracking-[0.25em] uppercase px-2 py-1 bg-cinnabar text-bg">
          verified
        </span>
        <span className="numeral text-xl">{sgd(lead.priceCents)}</span>
      </div>
      <div className="flex-1 min-w-[12rem]">
        <div className="text-sm text-bg/90">
          {lead.propertyInterest || "Property interest not specified"}
        </div>
        <div className="text-[11px] tracking-wide text-bg/50 mt-0.5">
          {lead.timeline ? `${lead.timeline} · ` : ""}
          phone verified{readings} · {ago}
        </div>
      </div>
      <form action={claimAction}>
        <input type="hidden" name="leadId" value={lead.id} />
        <button className="font-display text-base text-cinnabar inline-flex items-center gap-2 hover:gap-3 transition-all">
          Claim <span aria-hidden>→</span>
        </button>
      </form>
    </li>
  );
}

function ClaimRow({ claim, ago }: { claim: MyClaim; ago: string }) {
  return (
    <li className="py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
      <span className="text-[10px] tracking-[0.25em] uppercase text-bg/50 w-12">
        {claim.tier}
      </span>
      <div className="flex-1 min-w-[12rem]">
        <a
          href={`/leads/${claim.leadId}`}
          className="text-sm text-bg hover:text-cinnabar transition-colors"
        >
          {claim.name ?? claim.email}
        </a>
        <div className="text-[11px] tracking-wide text-bg/50 mt-0.5">
          {claim.phone ?? "—"} · {ago}
        </div>
      </div>
      <span className="numeral text-sm text-bg/60">{sgd(claim.priceCents)}</span>
      <a
        href={`/leads/${claim.leadId}`}
        className="text-sm text-cinnabar hover:underline"
      >
        Open →
      </a>
    </li>
  );
}
