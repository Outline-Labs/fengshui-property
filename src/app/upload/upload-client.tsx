"use client";

import posthog from "posthog-js";
import { useRef, useState } from "react";

import { resendVerification } from "@/app/login/actions";
import { FlyingStarsGrid } from "@/components/flying-stars-grid";
import { LuopanCasting } from "@/components/luopan-casting";
import { TalkToSpecialist } from "@/components/talk-to-specialist";
import { VerifyPhone } from "@/components/verify-phone";
import {
  computeFlyingStars,
  type Dir8,
  type FlyingStarChart,
} from "@/lib/fengshui/flying-stars";
import type { ReadingPack } from "@/lib/revolut";
import type {
  FloorPlanAnalysis,
  FloorPlanFactor,
  FloorPlanRoom,
  UnitEngineSummary,
} from "@/lib/types";

import { analyzeFloorPlan, recomputeReading } from "./actions";
import { buyReadingsAction } from "./credits-actions";

type CreditProps = {
  freeQuota: number;
  bonusReadings: number;
  referralUrl: string;
  referralReward: number;
  referralEarned: number;
  referralCount: number;
  packs: ReadingPack[];
  revolutReady: boolean;
};

function sgd(cents: number): string {
  return `S$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

const DIRECTIONS = [
  { code: "N", label: "North" },
  { code: "NE", label: "Northeast" },
  { code: "E", label: "East" },
  { code: "SE", label: "Southeast" },
  { code: "S", label: "South" },
  { code: "SW", label: "Southwest" },
  { code: "W", label: "West" },
  { code: "NW", label: "Northwest" },
] as const;

type Status = "idle" | "ready" | "analyzing" | "done" | "error";

export function UploadClient({
  remaining: initialRemaining,
  quota,
  canUpgrade,
  creditsBanner,
  errorBanner,
  emailVerified,
  verifyBanner,
  phoneVerified,
  specialistEnabled,
  specialistRequested,
  specialistPhone,
  ...credit
}: {
  remaining: number;
  quota: number;
  canUpgrade: boolean;
  creditsBanner?: string;
  errorBanner?: string;
  emailVerified: boolean;
  verifyBanner?: string;
  phoneVerified: boolean;
  specialistEnabled: boolean;
  specialistRequested: boolean;
  specialistPhone: string | null;
} & CreditProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [facing, setFacing] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [analysis, setAnalysis] = useState<FloorPlanAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const outOfCredits = remaining <= 0;
  const banner = bannerMessage(creditsBanner, errorBanner);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setError("Please upload an image (PNG / JPG) or a PDF.");
      setStatus("error");
      return;
    }
    setError(null);
    try {
      const dataUrl = isPdf
        ? await pdfToImageDataUrl(file)
        : await resizeImage(file);
      setPreview(dataUrl);
      setStatus("ready");
    } catch {
      setError("Couldn't read that file. Try another one.");
      setStatus("error");
    }
  };

  const runAnalysis = async () => {
    if (!preview) return;
    setStatus("analyzing");
    setError(null);
    const result = await analyzeFloorPlan(
      preview,
      directionLabel(facing),
      year ? Number(year) : undefined,
    );
    if (result.ok) {
      setAnalysis(result.analysis);
      setRemaining(result.remaining);
      setStatus("done");
    } else {
      if (result.code === "no_session") {
        window.location.href = "/signup?next=/upload";
        return;
      }
      setError(result.error);
      setStatus(result.code === "out_of_credits" ? "ready" : "error");
    }
  };

  const reset = () => {
    setPreview(null);
    setFacing("");
    setYear("");
    setAnalysis(null);
    setError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-5xl px-6 sm:px-10 py-12 sm:py-16">
        {banner && !bannerDismissed && (
          <div
            className={`mb-8 flex items-start justify-between gap-4 border px-5 py-3 text-sm ${
              banner.tone === "good"
                ? "border-jade bg-jade/10 text-ink-soft"
                : "border-cinnabar bg-cinnabar/10 text-ink-soft"
            }`}
          >
            <span>
              <span className={banner.tone === "good" ? "text-jade" : "text-cinnabar"}>
                ●
              </span>{" "}
              {banner.text}
            </span>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-muted hover:text-ink shrink-0"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {!emailVerified && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border border-cinnabar bg-cinnabar/5 px-5 py-3 text-sm">
            <span className="text-ink-soft">
              {verifyBanner === "sent"
                ? "Verification link sent — check your email to finish."
                : "Verify your email to secure your account and buy reading credits."}
            </span>
            {verifyBanner !== "sent" && (
              <form action={resendVerification}>
                <button className="font-display text-cinnabar hover:translate-x-0.5 transition-transform whitespace-nowrap">
                  Resend link →
                </button>
              </form>
            )}
          </div>
        )}
        <header className="mb-10 max-w-2xl">
          <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
            Tier II · Unit-level reading
          </div>
          <h1 className="font-display text-4xl sm:text-5xl leading-[0.98] tracking-[-0.02em]">
            Read <em className="text-cinnabar italic font-normal">your unit.</em>
          </h1>
          <p className="mt-5 text-ink-soft leading-relaxed">
            Upload your floor plan and set which way it faces. We overlay the
            Lo Shu nine-grid and read it against form school, flying stars
            (Period 9), and eight mansions — room by room.
          </p>
          <div className="mt-6 flex items-center gap-4 text-[11px] tracking-wide">
            <span className="inline-flex items-center gap-2 border border-line px-3 py-1.5">
              <span className={outOfCredits ? "text-muted" : "text-jade"}>●</span>
              <span className="text-ink-soft">
                {remaining} of {quota} reading{quota === 1 ? "" : "s"} left
                {credit.bonusReadings > 0 && (
                  <span className="text-muted"> · {credit.bonusReadings} bonus</span>
                )}
              </span>
            </span>
            {canUpgrade && (
              <a
                href="/signup?next=/upload"
                className="text-cinnabar hover:underline tracking-wide"
              >
                Complete your profile for more →
              </a>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
          {/* Left: upload + controls */}
          <section className="space-y-8">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted mb-3">
                01 · The floor plan
              </div>
              {preview ? (
                <div className="relative border border-line bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Your floor plan"
                    className="w-full h-auto max-h-[420px] object-contain bg-white"
                  />
                  <button
                    onClick={reset}
                    className="absolute top-2 right-2 bg-ink/85 text-bg text-xs tracking-wide px-3 py-1.5 hover:bg-cinnabar transition-colors"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void handleFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`block border-2 border-dashed cursor-pointer transition-colors px-6 py-16 text-center ${
                    dragging
                      ? "border-cinnabar bg-bg-warm"
                      : "border-line hover:border-muted bg-surface"
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0])}
                  />
                  <div className="font-display text-xl mb-2">
                    Drop your floor plan here
                  </div>
                  <div className="text-sm text-muted">
                    or click to browse · PNG / JPG / PDF · stays private, not
                    stored
                  </div>
                </label>
              )}
            </div>

            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted mb-1">
                02 · Facing direction
              </div>
              <p className="text-xs text-muted mb-3">
                Which way does the front face — main door, main windows, or
                balcony?
              </p>
              <div className="grid grid-cols-4 gap-2">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.code}
                    onClick={() => setFacing(d.code)}
                    className={`py-2.5 text-sm border transition-colors ${
                      facing === d.code
                        ? "border-cinnabar bg-cinnabar text-bg"
                        : "border-line hover:border-muted text-ink"
                    }`}
                  >
                    {d.code}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-muted mb-2">
                03 · Year built / renovated{" "}
                <span className="text-muted/60">(optional)</span>
              </div>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2019"
                className="w-40 bg-transparent border-b-2 border-line focus:border-cinnabar transition-colors py-2 text-base placeholder:text-muted focus:outline-none"
              />
            </div>

            <div className="pt-2">
              {outOfCredits ? (
                <div className="border-t border-cinnabar pt-5 space-y-8">
                  <div>
                    <div className="text-[10px] tracking-[0.3em] uppercase text-cinnabar mb-2">
                      No readings left
                    </div>
                    <p className="text-ink-soft text-sm leading-relaxed max-w-sm">
                      You&rsquo;ve used your readings.{" "}
                      {canUpgrade
                        ? "Complete your profile to unlock more — or earn free readings by inviting a friend."
                        : "Invite a friend for free readings, or top up below."}
                    </p>
                    {canUpgrade && (
                      <a
                        href="/signup?next=/upload"
                        className="mt-3 font-display text-lg text-cinnabar inline-flex items-center gap-2 hover:gap-3 transition-all"
                      >
                        Complete your profile <span aria-hidden>→</span>
                      </a>
                    )}
                  </div>
                  <ReferralInvite {...credit} />
                  {!phoneVerified && (
                    <VerifyPhone initialPhone={specialistPhone} />
                  )}
                  <BuyReadings packs={credit.packs} revolutReady={credit.revolutReady} />
                </div>
              ) : (
                <button
                  onClick={runAnalysis}
                  disabled={!preview || !facing || status === "analyzing"}
                  className="font-display text-xl text-cinnabar inline-flex items-center gap-2 hover:translate-x-1 transition-transform disabled:opacity-30 disabled:translate-x-0"
                >
                  {status === "analyzing" ? "Reading the plan…" : "Read my unit"}{" "}
                  <span aria-hidden>→</span>
                </button>
              )}
              {error && <p className="text-sm text-cinnabar mt-4">{error}</p>}
              <p className="text-[10px] tracking-wide text-muted mt-5 max-w-sm leading-relaxed">
                AI-assisted analysis based on traditional fengshui principles —
                a first-pass reading, not a formal audit. Your floor plan is
                analysed in the moment and not stored on our servers.
              </p>
            </div>
          </section>

          {/* Right: report */}
          <section className="lg:border-l lg:border-line lg:pl-14">
            {status === "analyzing" ? (
              <LuopanCasting />
            ) : status === "done" && analysis ? (
              <Report
                analysis={analysis}
                chart={
                  facing
                    ? computeFlyingStars(
                        facing as Dir8,
                        year ? Number(year) : undefined,
                      )
                    : null
                }
                facing={facing}
                year={year ? Number(year) : undefined}
                onUpdate={setAnalysis}
                specialistEnabled={specialistEnabled}
                specialistRequested={specialistRequested}
                specialistPhone={specialistPhone}
                referral={credit}
                onReset={reset}
              />
            ) : (
              <ReportPlaceholder />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function ReportPlaceholder() {
  return (
    <div className="h-full flex flex-col justify-center py-12">
      <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
        The reading
      </div>
      <p className="font-display text-2xl leading-snug text-muted max-w-sm">
        Your unit&rsquo;s reading will appear here once you upload a plan and
        set its facing.
      </p>
    </div>
  );
}

function Report({
  analysis,
  chart,
  facing,
  year,
  onUpdate,
  specialistEnabled,
  specialistRequested,
  specialistPhone,
  referral,
  onReset,
}: {
  analysis: FloorPlanAnalysis;
  chart: FlyingStarChart | null;
  facing: string;
  year: number | undefined;
  onUpdate: (a: FloorPlanAnalysis) => void;
  specialistEnabled: boolean;
  specialistRequested: boolean;
  specialistPhone: string | null;
  referral: CreditProps;
  onReset: () => void;
}) {
  const positives = analysis.factors.filter((f) => f.type === "positive");
  const negatives = analysis.factors.filter((f) => f.type === "negative");

  return (
    <div className="space-y-10">
      <div>
        <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3 flex items-center justify-between">
          <span>The reading · facing {analysis.facing}</span>
          <span className="text-muted/70">confidence: {analysis.confidence}</span>
        </div>
        <div className="border-t-2 border-ink pt-4 flex items-baseline gap-4">
          <span className={`numeral text-[5rem] leading-[0.85] ${tone(analysis.score)}`}>
            {Math.round(analysis.score)}
          </span>
          <span className="text-2xl text-muted font-display">/ 10</span>
        </div>
        {analysis.summary && (
          <p className="mt-4 text-ink-soft leading-relaxed">{analysis.summary}</p>
        )}
      </div>

      {analysis.engine && <EightMansions engine={analysis.engine} />}

      {chart && (
        <section>
          <SectionHead
            n=""
            title={`Flying stars · Period ${chart.period}`}
            cn="玄空飞星"
          />
          <FlyingStarsGrid chart={chart} />
          <p className="text-xs text-muted leading-relaxed mt-3">
            Computed from your {analysis.facing} facing — the deterministic natal
            chart (下卦). Mountain stars govern health and relationships; water
            stars govern wealth.
          </p>
        </section>
      )}

      <ConfirmLayout
        analysis={analysis}
        facing={facing}
        year={year}
        onUpdate={onUpdate}
      />

      {positives.length > 0 && (
        <FactorList title="What strengthens this unit" cn="得" factors={positives} accent="jade" />
      )}
      {negatives.length > 0 && (
        <FactorList title="What to watch" cn="忌" factors={negatives} accent="cinnabar" />
      )}

      {analysis.recommendations.length > 0 && (
        <section>
          <SectionHead n="" title="Remedies" cn="化解" />
          <ol className="space-y-4">
            {analysis.recommendations.map((r, i) => (
              <li key={i} className="flex gap-4">
                <span className="numeral text-2xl text-cinnabar leading-none shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="font-display text-base leading-tight">
                    {r.title}
                  </div>
                  {r.detail && (
                    <p className="text-sm text-ink-soft leading-relaxed mt-1">
                      {r.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {specialistEnabled && (
        <TalkToSpecialist
          requested={specialistRequested}
          initialPhone={specialistPhone}
        />
      )}

      <ReferralInvite {...referral} />

      <div className="border-t border-line pt-5">
        <button
          onClick={onReset}
          className="font-display text-lg text-cinnabar inline-flex items-center gap-2 hover:gap-3 transition-all"
        >
          <span aria-hidden>↻</span> Read another plan
        </button>
      </div>
    </div>
  );
}

const SECTOR_OPTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "center", "—"];

// The reproducibility fix: the score is computed from where each room sits, but
// the room→sector read is the model's (fuzzy) perception. Let the user confirm/
// correct it, then recompute deterministically — no model call, no credit.
function ConfirmLayout({
  analysis,
  facing,
  year,
  onUpdate,
}: {
  analysis: FloorPlanAnalysis;
  facing: string;
  year: number | undefined;
  onUpdate: (a: FloorPlanAnalysis) => void;
}) {
  const [rooms, setRooms] = useState<FloorPlanRoom[]>(analysis.rooms);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const edit = (i: number, patch: Partial<FloorPlanRoom>) => {
    setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const remove = (i: number) => {
    setRooms((rs) => rs.filter((_, j) => j !== i));
    setDirty(true);
  };
  const add = () => {
    setRooms((rs) => [...rs, { name: "Room", sector: "center" }]);
    setDirty(true);
  };

  const apply = async () => {
    setBusy(true);
    const res = await recomputeReading(facing, year, rooms);
    setBusy(false);
    if (!res.ok) return;
    const formSchool = analysis.factors.filter((f) => f.principle === "峦头");
    onUpdate({
      ...analysis,
      rooms,
      score: res.score,
      factors: [...res.factors, ...formSchool],
      engine: res.engine,
    });
    setDirty(false);
    posthog.capture("reading_layout_confirmed", {
      facing,
      year_built: year,
      room_count: rooms.length,
      new_score: res.score,
    });
  };

  return (
    <section>
      <SectionHead n="" title="Confirm the layout" cn="格局" />
      <p className="text-xs text-muted leading-relaxed mb-4 max-w-md">
        We read these rooms from your plan, and the score is computed from where
        each one sits. If we placed a room in the wrong sector, fix it and re-read
        — it&rsquo;s instant and costs no credit.
      </p>
      <div className="space-y-2">
        {rooms.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.name}
              onChange={(e) => edit(i, { name: e.target.value })}
              className="flex-1 min-w-0 bg-transparent border-b border-line focus:border-cinnabar py-1.5 text-sm focus:outline-none"
            />
            <select
              value={SECTOR_OPTIONS.includes(r.sector) ? r.sector : "—"}
              onChange={(e) => edit(i, { sector: e.target.value })}
              className="bg-transparent border border-line py-1.5 px-2 text-sm focus:outline-none focus:border-cinnabar text-ink"
            >
              {SECTOR_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              onClick={() => remove(i)}
              aria-label="Remove room"
              className="text-muted hover:text-cinnabar px-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-6">
        <button onClick={add} className="text-sm text-ink-soft hover:text-cinnabar">
          + Add room
        </button>
        {dirty && (
          <button
            onClick={apply}
            disabled={busy}
            className="font-display text-base text-cinnabar inline-flex items-center gap-2 hover:gap-3 transition-all disabled:opacity-40"
          >
            {busy ? "Re-reading…" : "Update reading"} <span aria-hidden>→</span>
          </button>
        )}
      </div>
    </section>
  );
}

function EightMansions({ engine }: { engine: UnitEngineSummary }) {
  return (
    <section>
      <SectionHead n="" title="Eight Mansions" cn="八宅" />
      <p className="text-sm text-ink-soft leading-relaxed">
        A <span className="text-ink">{engine.houseGua} house</span> ({engine.group}),
        read for Period {engine.period}. Favour the auspicious sectors for
        bedrooms, the stove, and where you spend your waking hours — and keep
        bathrooms and storage in the inauspicious ones.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-jade mb-2">
            吉 · Auspicious
          </div>
          <div className="flex flex-wrap gap-1.5">
            {engine.auspicious.map((d) => (
              <span
                key={d}
                className="border border-jade/50 text-jade px-2.5 py-1 text-xs"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-cinnabar mb-2">
            凶 · Inauspicious
          </div>
          <div className="flex flex-wrap gap-1.5">
            {engine.inauspicious.map((d) => (
              <span
                key={d}
                className="border border-cinnabar/40 text-cinnabar px-2.5 py-1 text-xs"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHead({ title, cn }: { n: string; title: string; cn: string }) {
  return (
    <header className="flex items-baseline justify-between border-t border-ink pt-4 mb-5">
      <h3 className="font-display text-xl tracking-tight">{title}</h3>
      <span className="font-cn text-xl text-cinnabar">{cn}</span>
    </header>
  );
}

function FactorList({
  title,
  cn,
  factors,
  accent,
}: {
  title: string;
  cn: string;
  factors: FloorPlanFactor[];
  accent: "jade" | "cinnabar";
}) {
  return (
    <section>
      <SectionHead n="" title={title} cn={cn} />
      <ul className="space-y-5">
        {factors.map((f, i) => (
          <li key={i}>
            <div className="flex items-baseline gap-3 mb-1">
              <SeverityDots severity={f.severity} accent={accent} />
              <span className="font-display text-base leading-tight">
                {f.title}
              </span>
              <span className="font-cn text-xs text-muted ml-auto shrink-0">
                {f.principle}
              </span>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed pl-[2.4rem]">
              {f.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeverityDots({
  severity,
  accent,
}: {
  severity: 1 | 2 | 3;
  accent: "jade" | "cinnabar";
}) {
  const cls = accent === "jade" ? "bg-jade" : "bg-cinnabar";
  return (
    <span className="flex items-center gap-0.5 shrink-0 pt-1">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= severity ? cls : "bg-line"}`}
        />
      ))}
    </span>
  );
}

function tone(score: number) {
  if (score >= 8) return "text-cinnabar";
  if (score >= 6.5) return "text-jade";
  if (score >= 4) return "text-ink";
  return "text-earth";
}

function directionLabel(code: string): string {
  return DIRECTIONS.find((d) => d.code === code)?.label ?? code;
}

function bannerMessage(
  credits: string | undefined,
  error: string | undefined,
): { tone: "good" | "bad"; text: string } | undefined {
  if (credits === "success" || credits === "devcredit") {
    return { tone: "good", text: "Readings added — enjoy." };
  }
  if (credits === "done") {
    // Revolut has a single post-payment redirect and the webhook is the source
    // of truth for crediting — confirm receipt without promising the count yet.
    return {
      tone: "good",
      text: "Payment received — your readings will appear in a moment.",
    };
  }
  if (error === "billing_unavailable") {
    return {
      tone: "bad",
      text: "Payments aren't available right now. Please try again later.",
    };
  }
  if (error === "badpack") {
    return { tone: "bad", text: "That pack isn't available — please pick another." };
  }
  return undefined;
}

// Share-to-earn: each side gets a bonus reading once the invited friend reads
// their first unit. The currency (free readings) costs us ~one Kimi call, so
// it's cheap viral fuel; the per-referrer cap lives server-side.
function ReferralInvite({
  referralUrl,
  referralReward,
  referralEarned,
  referralCount,
}: CreditProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      posthog.capture("referral_link_copied");
    } catch {
      // clipboard blocked — the input is selectable as a fallback
    }
  };

  return (
    <section className="border border-jade/40 bg-jade/[0.04] p-5">
      <div className="text-[10px] tracking-[0.3em] uppercase text-jade mb-2">
        Invite friends · 邀请
      </div>
      <p className="text-sm text-ink-soft leading-relaxed mb-4 max-w-sm">
        Share your link. When a friend signs up and reads their first unit,{" "}
        <span className="text-ink">you both get {referralReward} free readings</span>.
      </p>
      <div className="flex items-stretch gap-2 max-w-md">
        <input
          readOnly
          value={referralUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 bg-surface border border-line px-3 py-2 text-xs text-ink-soft focus:outline-none focus:border-jade"
        />
        <button
          onClick={copy}
          className="shrink-0 border border-jade text-jade px-4 py-2 text-sm hover:bg-jade hover:text-bg transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {referralCount > 0 && (
        <p className="text-xs text-jade mt-3">
          You&rsquo;ve earned {referralEarned} reading{referralEarned === 1 ? "" : "s"}{" "}
          from {referralCount} friend{referralCount === 1 ? "" : "s"}. 谢谢!
        </p>
      )}
    </section>
  );
}

// Reading-credit packs via the Revolut hosted checkout page (server action
// redirects). Each pack is its own form so the validated price posts straight
// through.
function BuyReadings({
  packs,
  revolutReady,
}: {
  packs: ReadingPack[];
  revolutReady: boolean;
}) {
  return (
    <section>
      <div className="text-[10px] tracking-[0.3em] uppercase text-muted mb-3">
        Or top up · 充值
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {packs.map((p) => (
          <form key={p.cents} action={buyReadingsAction}>
            <input type="hidden" name="cents" value={p.cents} />
            <button
              type="submit"
              className="w-full border border-line hover:border-cinnabar transition-colors px-4 py-3 text-left group"
            >
              <div className="font-display text-lg text-ink group-hover:text-cinnabar transition-colors">
                {sgd(p.cents)}
              </div>
              <div className="text-xs text-muted">
                {p.readings} readings · {p.label}
              </div>
            </button>
          </form>
        ))}
      </div>
      {!revolutReady && (
        <p className="text-[10px] tracking-wide text-muted mt-2">
          Dev mode — credited instantly without payment.
        </p>
      )}
    </section>
  );
}

async function pdfToImageDataUrl(file: File, maxDim = 1600): Promise<string> {
  // Legacy build is transpiled + polyfilled for older runtimes (the modern
  // build calls Uint8Array.prototype.toHex which many browsers lack). The
  // matching legacy worker is copied into /public.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxDim / Math.max(base.width, base.height), 3);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function resizeImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  // Flatten transparency — floor plans are often PNGs with alpha.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}
