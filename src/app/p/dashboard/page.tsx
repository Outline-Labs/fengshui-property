import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CopyText } from "@/components/copy-text";
import {
  type MarketLead,
  type MyClaim,
  VERIFIED_PRICE_CENTS,
  getAgent,
  listAvailableLeads,
  listMyClaims,
  sgd,
} from "@/lib/agents";
import { getAgentId } from "@/lib/session";
import { TOPUP_PACKS_CENTS, stripeConfigured } from "@/lib/stripe";
import { getWallet } from "@/lib/wallet";

import { agentLogout, claimAction, topUpAction } from "./actions";

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
  searchParams: Promise<{ error?: string; topup?: string }>;
}) {
  const agentId = await getAgentId();
  if (!agentId) redirect("/login");
  const agent = await getAgent(agentId);
  if (!agent) redirect("/login");

  const { error, topup } = await searchParams;
  const [leads, claims, wallet] = await Promise.all([
    listAvailableLeads(),
    listMyClaims(agentId),
    getWallet(agentId),
  ]);
  const spent = claims.reduce((s, c) => s + c.priceCents, 0);
  const balanceCents = wallet.balanceCents;
  const stripeReady = stripeConfigured();

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
              <div className="numeral text-2xl text-jade">
                {sgd(balanceCents)}
              </div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50">
                balance
              </div>
            </div>
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

        {(topup === "success" || topup === "devcredit") && (
          <div className="border border-jade bg-jade/10 px-5 py-3 mb-8 text-sm">
            Wallet topped up{topup === "devcredit" ? " (dev credit)" : ""}.
            You&rsquo;re ready to claim.
          </div>
        )}
        {error === "insufficient" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mb-8 text-sm">
            Not enough balance to claim that lead — top up your wallet below.
          </div>
        )}
        {error === "taken" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mb-8 text-sm">
            Another agent claimed that lead first — it moves fast.
          </div>
        )}
        {error === "billing_unavailable" && (
          <div className="border border-cinnabar bg-cinnabar/10 px-5 py-3 mb-8 text-sm">
            Top-ups are temporarily unavailable. Please try again shortly.
          </div>
        )}

        <section className="mb-12 border border-bg/15 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-md">
              <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50 mb-1">
                Wallet
              </div>
              <p className="text-sm text-bg/70">
                Pre-fund to claim instantly — each verified lead is{" "}
                {sgd(VERIFIED_PRICE_CENTS)}. Claiming debits your balance.
                {!stripeReady && (
                  <span className="text-cinnabar">
                    {" "}
                    Dev mode: top-ups credit instantly.
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TOPUP_PACKS_CENTS.map((cents) => {
                const leadsCount = Math.round(cents / VERIFIED_PRICE_CENTS);
                return (
                  <form action={topUpAction} key={cents}>
                    <input type="hidden" name="amountCents" value={cents} />
                    <button className="border border-bg/30 hover:border-cinnabar hover:text-cinnabar transition-colors px-4 py-2 text-sm whitespace-nowrap">
                      {sgd(cents)}{" "}
                      <span className="text-bg/40">
                        · {leadsCount} lead{leadsCount > 1 ? "s" : ""}
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        </section>

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
                <LeadRow
                  key={l.id}
                  lead={l}
                  ago={ago(l.verifiedAt ?? l.createdAt)}
                  canAfford={balanceCents >= l.priceCents}
                />
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
            <ul className="space-y-3">
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

function LeadRow({
  lead,
  ago,
  canAfford,
}: {
  lead: MarketLead;
  ago: string;
  canAfford: boolean;
}) {
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
      {canAfford ? (
        <form action={claimAction}>
          <input type="hidden" name="leadId" value={lead.id} />
          <button className="font-display text-base text-cinnabar inline-flex items-center gap-2 hover:gap-3 transition-all">
            Claim <span aria-hidden>→</span>
          </button>
        </form>
      ) : (
        <span
          className="text-[11px] tracking-[0.2em] uppercase text-bg/40"
          title="Top up your wallet to claim"
        >
          Top up to claim
        </span>
      )}
    </li>
  );
}

function ClaimRow({ claim, ago }: { claim: MyClaim; ago: string }) {
  const digits = (claim.phone ?? "").replace(/\D/g, "").replace(/^65/, "");
  const isSg = /^[89]\d{7}$/.test(digits);
  const phoneDisplay = isSg ? `+65 ${digits}` : (claim.phone ?? "—");
  const phoneCopy = isSg ? `+65${digits}` : (claim.phone ?? "");
  const meta = [
    claim.propertyInterest || null,
    claim.timeline || null,
    claim.readings > 0
      ? `${claim.readings} reading${claim.readings > 1 ? "s" : ""}${
          claim.bestScore != null ? ` · best ${claim.bestScore.toFixed(1)}/10` : ""
        }`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="border border-bg/15 p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-[14rem]">
          <a
            href={`/leads/${claim.leadId}`}
            className="font-display text-xl tracking-tight hover:text-cinnabar transition-colors"
          >
            {claim.name ?? claim.email}
          </a>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm">
            {claim.phone && (
              <CopyText
                value={phoneCopy}
                label={phoneDisplay}
                className="text-cinnabar"
              />
            )}
            <span className="text-bg/60">{claim.email}</span>
          </div>
          {meta && (
            <div className="text-[11px] tracking-wide text-bg/50 mt-1.5">
              {meta}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="numeral text-sm text-bg/60">{sgd(claim.priceCents)}</div>
          <div className="text-[10px] tracking-[0.2em] uppercase text-bg/40 mt-1">
            claimed {ago}
          </div>
          <a
            href={`/leads/${claim.leadId}`}
            className="text-sm text-cinnabar hover:underline mt-2 inline-block"
          >
            Open →
          </a>
        </div>
      </div>
    </li>
  );
}
