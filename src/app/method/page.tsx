import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { SiteMasthead } from "@/components/site-masthead";

export const metadata: Metadata = {
  title: "The Method · Fengshui AI",
  description:
    "How Fengshui AI reads a Singapore property — form school (峦头), flying stars (玄空飞星), and eight mansions (八宅), combining a deterministic chart with AI interpretation. Every factor cites its source.",
};

const SCHOOLS = [
  {
    en: "Form School",
    cn: "峦头",
    body: "The oldest layer. It reads the shape of the land and the built environment — where water gathers, where roads point, what sits behind and in front. Qi rides the wind and halts at water; form school traces that flow around and through a building.",
  },
  {
    en: "Flying Stars",
    cn: "玄空飞星",
    body: "The time layer. A property's energy is fixed at construction by its period and its facing, producing a nine-palace chart of mountain and water stars. This is pure calculation — we compute it deterministically, never guess it.",
  },
  {
    en: "Eight Mansions",
    cn: "八宅",
    body: "The occupant layer. From the facing, the home divides into four auspicious and four inauspicious sectors. It tells you where to sleep, work, and cook — and where not to.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Measure the form",
    body: "From OneMap and OpenStreetMap we read what surrounds the property — cemeteries, hospitals, parks, MRT lines, expressways, water — and score it against form-school principles. 3,678 points of interest, catalogued.",
  },
  {
    n: "02",
    title: "Cast the chart",
    body: "From the facing direction and construction period we compute the flying-stars natal chart by the 下卦 method. This is arithmetic — the same inputs always yield the same chart, and you can check our working.",
  },
  {
    n: "03",
    title: "Interpret the unit",
    body: "An AI vision model reads your floor plan against the chart and the eight-mansions sectors — door, stove, bedrooms, corners — and writes a plain-English reading. Every factor names the school it comes from.",
  },
];

export default function MethodPage() {
  return (
    <>
      <SiteMasthead />
      <main className="flex-1">
        <section className="border-b border-line">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 pt-12 pb-16 sm:pt-16 sm:pb-20">
            <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-4 flex flex-wrap gap-x-3">
              <span>The Method</span>
              <span className="text-cinnabar">·</span>
              <span className="font-cn tracking-normal text-ink-soft">方法</span>
            </div>
            <h1 className="font-display text-[clamp(2.5rem,7vw,5rem)] leading-[0.98] tracking-[-0.025em] max-w-3xl">
              Classical roots,{" "}
              <em className="text-cinnabar italic font-normal">
                checkable working.
              </em>
            </h1>
            <p className="mt-7 max-w-xl text-lg text-ink-soft leading-relaxed">
              We don&rsquo;t invent fengshui. We compute what can be computed,
              cite what is traditional, and let an AI interpret the rest — always
              naming its source so you can verify, dispute, or learn.
            </p>
          </div>
        </section>

        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
            <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
              I. Three schools
            </div>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em] mb-12 max-w-2xl">
              Form, time, and{" "}
              <em className="text-cinnabar italic font-normal">occupant.</em>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14">
              {SCHOOLS.map((s) => (
                <article key={s.en} className="border-t-2 border-ink pt-5">
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="font-display text-2xl tracking-tight">
                      {s.en}
                    </h3>
                    <span className="font-cn text-2xl text-cinnabar">{s.cn}</span>
                  </div>
                  <p className="text-ink-soft leading-relaxed text-sm">
                    {s.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
            <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
              II. How a reading is made
            </div>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em] mb-12 max-w-2xl">
              Three passes.
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14">
              {STEPS.map((s) => (
                <article key={s.n} className="space-y-4">
                  <div className="numeral text-6xl text-cinnabar leading-none">
                    {s.n}.
                  </div>
                  <div className="border-t border-line pt-4">
                    <h3 className="font-display text-2xl tracking-tight mb-2">
                      {s.title}
                    </h3>
                    <p className="text-ink-soft leading-relaxed text-sm">
                      {s.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-5">
                <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
                  III. Our honesty
                </div>
                <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em]">
                  Where the AI ends.
                </h2>
              </div>
              <div className="lg:col-span-7 space-y-6 text-ink-soft leading-relaxed">
                <p>
                  The flying-stars chart is mathematics — it is exactly right.
                  The form-school factors are measured from real map data. The
                  interpretation of your floor plan, though, is an AI reading:
                  helpful as a first pass, not a substitute for a master&rsquo;s
                  audit.
                </p>
                <p>
                  We use AI because it scales a careful first look to every home
                  in Singapore, for free. We tell you its confidence on each
                  reading, and we never claim certainty we don&rsquo;t have.
                </p>
                <blockquote className="pl-5 border-l-2 border-cinnabar font-display text-xl italic leading-snug text-ink">
                  &ldquo;The qi rides the wind and scatters; it halts at the
                  water&rsquo;s edge.&rdquo;
                  <footer className="not-italic font-body text-xs text-muted mt-3 tracking-wider uppercase">
                    — Guo Pu, <span className="font-cn">葬书</span> · 4th c.
                  </footer>
                </blockquote>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 py-16 flex flex-wrap items-baseline justify-between gap-6">
            <h2 className="font-display text-3xl sm:text-4xl tracking-[-0.02em]">
              Read your own home.
            </h2>
            <div className="flex gap-x-8">
              <a
                href="/map"
                className="font-display text-xl text-cinnabar hover:translate-x-1 transition-transform inline-flex items-center gap-2"
              >
                Open the map <span aria-hidden>→</span>
              </a>
              <a
                href="/upload"
                className="font-display text-xl text-cinnabar hover:translate-x-1 transition-transform inline-flex items-center gap-2"
              >
                Upload a floor plan <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
