import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getClaimedLeadDetail, sgd } from "@/lib/agents";
import { getAgentId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Lead · Fengshui AI Partners",
  robots: { index: false, follow: false },
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const agentId = await getAgentId();
  if (!agentId) redirect("/login");
  const { id } = await params;
  const detail = await getClaimedLeadDetail(agentId, id);
  if (!detail) redirect("/dashboard");

  const { lead, analyses, tier, priceCents, claimedAt } = detail;
  const best = analyses.reduce<number | null>(
    (m, a) => (a.score != null && (m == null || a.score > m) ? a.score : m),
    null,
  );

  const pitchPoints = buildPitch(lead, analyses, best);

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-3xl px-6 sm:px-10 py-12 sm:py-16">
        <a
          href="/dashboard"
          className="text-sm text-bg/60 hover:text-bg transition-colors"
        >
          ← Dashboard
        </a>

        <header className="mt-6 border-b border-bg/15 pb-6">
          <div className="flex items-center gap-3 text-[10px] tracking-[0.3em] uppercase text-bg/50 mb-3">
            <span className="px-2 py-1 bg-cinnabar text-bg">{tier} lead</span>
            <span>claimed · {sgd(priceCents)}</span>
            <span>{new Date(claimedAt).toLocaleDateString("en-SG")}</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-[-0.02em]">
            {lead.name ?? "Buyer"}
          </h1>
        </header>

        <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
          <Field label="Phone / WhatsApp" value={lead.phone ?? "—"} accent />
          <Field label="Email" value={lead.email} />
          <Field
            label="Property of interest"
            value={lead.propertyInterest ?? "Not specified"}
          />
          <Field label="Buying timeline" value={lead.timeline ?? "Not specified"} />
        </section>

        {analyses.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl tracking-tight border-b border-bg/15 pb-3 mb-5">
              What they&rsquo;ve read
            </h2>
            <ul className="space-y-2">
              {analyses.map((a, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between border-b border-bg/10 pb-2 text-sm"
                >
                  <span className="text-bg/80">
                    Floor plan · facing {a.facing ?? "—"}
                  </span>
                  <span className="numeral text-cinnabar">
                    {a.score != null ? `${a.score.toFixed(1)}/10` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12">
          <h2 className="font-display text-2xl tracking-tight border-b border-bg/15 pb-3 mb-5">
            Pitch points · 推介
          </h2>
          <ol className="space-y-4">
            {pitchPoints.map((p, i) => (
              <li key={i} className="flex gap-4">
                <span className="numeral text-xl text-cinnabar leading-none shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-bg/80 leading-relaxed text-sm">{p}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 border-t border-bg/15 pt-6">
          <a
            href={`https://wa.me/${(lead.phone ?? "").replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="font-display text-xl text-cinnabar inline-flex items-center gap-2 hover:translate-x-1 transition-transform"
          >
            Message on WhatsApp <span aria-hidden>→</span>
          </a>
          <p className="text-[10px] tracking-wide text-bg/40 mt-4 max-w-md leading-relaxed">
            Contact within 24 hours. This buyer consented to be reached about
            their property interest. Keep it relevant to that.
          </p>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border-t border-bg/20 pt-3">
      <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50 mb-1">
        {label}
      </div>
      <div className={`text-base ${accent ? "text-cinnabar" : "text-bg/90"}`}>
        {value}
      </div>
    </div>
  );
}

function buildPitch(
  lead: { propertyInterest: string | null; timeline: string | null },
  analyses: { facing: string | null; score: number | null }[],
  best: number | null,
): string[] {
  const pts: string[] = [];
  if (best != null && best >= 6.5) {
    pts.push(
      `Open on the positive — their unit read ${best.toFixed(1)}/10. Affirm the auspicious facing and the gathering sectors before discussing fixes.`,
    );
  } else if (best != null) {
    pts.push(
      `Their unit read ${best.toFixed(1)}/10 — there are concerns to address. Position yourself as the person who can find a better-aligned unit, or remedies for this one.`,
    );
  } else {
    pts.push(
      "They've explored the location reading but not a specific unit yet — they're early. Offer to shortlist fengshui-aligned options in their area.",
    );
  }
  if (analyses.length >= 2) {
    pts.push(
      `They've run ${analyses.length} readings — actively comparing units. Move quickly; they're in decision mode.`,
    );
  }
  if (lead.timeline) {
    pts.push(`Stated timeline: ${lead.timeline}. Pace your follow-up to match.`);
  }
  if (lead.propertyInterest) {
    pts.push(
      `They named "${lead.propertyInterest}" — come prepared with what you know about that block/area's fengshui and the market there.`,
    );
  }
  pts.push(
    "Lead with fengshui fluency — it's why they're here. Knowing Period 9 facings and the flying-stars basics builds instant trust.",
  );
  return pts;
}
