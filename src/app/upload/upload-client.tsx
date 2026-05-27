"use client";

import { useRef, useState } from "react";

import type {
  FloorPlanAnalysis,
  FloorPlanFactor,
} from "@/lib/types";

import { analyzeFloorPlan } from "./actions";

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
}: {
  remaining: number;
  quota: number;
  canUpgrade: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [facing, setFacing] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [analysis, setAnalysis] = useState<FloorPlanAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const inputRef = useRef<HTMLInputElement>(null);
  const outOfCredits = remaining <= 0;

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
                {remaining} of {quota} free reading{quota === 1 ? "" : "s"} left
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
                <div className="border-t border-cinnabar pt-5">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-cinnabar mb-2">
                    No free readings left
                  </div>
                  <p className="text-ink-soft text-sm leading-relaxed mb-4 max-w-sm">
                    You&rsquo;ve used your free readings.{" "}
                    {canUpgrade
                      ? "Complete your profile to unlock more, or have a local specialist walk you through your unit in person."
                      : "Have a local property specialist walk you through your unit in person — free."}
                  </p>
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    {canUpgrade && (
                      <a
                        href="/signup?next=/upload"
                        className="font-display text-lg text-cinnabar inline-flex items-center gap-2 hover:gap-3 transition-all"
                      >
                        Unlock more <span aria-hidden>→</span>
                      </a>
                    )}
                    <a
                      href="/signup?next=/upload"
                      className="text-sm text-ink-soft hover:text-cinnabar transition-colors self-center"
                    >
                      Talk to a specialist
                    </a>
                  </div>
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
            {status === "done" && analysis ? (
              <Report analysis={analysis} onReset={reset} />
            ) : (
              <ReportPlaceholder analyzing={status === "analyzing"} />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function ReportPlaceholder({ analyzing }: { analyzing: boolean }) {
  return (
    <div className="h-full flex flex-col justify-center py-12">
      <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
        {analyzing ? "Reading…" : "The reading"}
      </div>
      {analyzing ? (
        <>
          <h2 className="font-display text-3xl tracking-[-0.02em] mb-6">
            Overlaying the nine-grid.
          </h2>
          <div className="space-y-2 max-w-xs">
            {["80%", "62%", "70%", "55%"].map((w, i) => (
              <div
                key={i}
                className="h-3 bg-line-soft animate-pulse"
                style={{ width: w, animationDuration: "1.6s" }}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="font-display text-2xl leading-snug text-muted max-w-sm">
          Your unit&rsquo;s reading will appear here once you upload a plan and
          set its facing.
        </p>
      )}
    </div>
  );
}

function Report({
  analysis,
  onReset,
}: {
  analysis: FloorPlanAnalysis;
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
            {analysis.score.toFixed(1)}
          </span>
          <span className="text-2xl text-muted font-display">/ 10</span>
        </div>
        {analysis.summary && (
          <p className="mt-4 text-ink-soft leading-relaxed">{analysis.summary}</p>
        )}
      </div>

      {analysis.rooms.length > 0 && (
        <section>
          <SectionHead n="" title="Rooms read" cn="格局" />
          <div className="flex flex-wrap gap-2">
            {analysis.rooms.map((r, i) => (
              <span
                key={i}
                className="inline-flex items-baseline gap-2 border border-line px-3 py-1.5 text-sm"
                title={r.note}
              >
                <span className="text-ink">{r.name}</span>
                <span className="text-[10px] tracking-wide uppercase text-cinnabar">
                  {r.sector}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

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
