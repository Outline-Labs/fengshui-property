import { SiteFooter } from "@/components/site-footer";
import { SiteMasthead } from "@/components/site-masthead";

export default function Home() {
  return (
    <>
      <SiteMasthead />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Methodology />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="border-b border-line relative overflow-hidden">
      <BaguaWatermark />
      <div className="relative mx-auto max-w-7xl px-6 sm:px-10 pt-10 pb-16 sm:pt-12 sm:pb-20 lg:pt-14 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-6 lg:space-y-7">
            <div className="rise [animation-delay:0ms] flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs tracking-[0.3em] uppercase text-muted">
              <span>Volume 01</span>
              <span className="text-cinnabar">·</span>
              <span>Established 2026</span>
              <span className="text-cinnabar">·</span>
              <span className="font-cn tracking-normal text-ink-soft">
                新加坡
              </span>
            </div>

            <h1 className="rise [animation-delay:200ms] font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.95] tracking-[-0.025em] text-ink">
              Read your home&rsquo;s{" "}
              <em className="text-cinnabar font-normal italic">qi.</em>
              <br />
              <span className="text-muted">Free.</span>
            </h1>

            <p className="rise [animation-delay:400ms] max-w-md text-base sm:text-lg leading-relaxed text-ink-soft">
              AI-powered fengshui analysis for every Singapore property —{" "}
              <span className="text-ink">HDB, condo, landed.</span> Built on
              form school, flying stars, and eight mansions traditions. Every
              factor cites its source.
            </p>

            <form
              action="/map"
              method="get"
              className="rise [animation-delay:600ms] flex max-w-xl border-b-2 border-ink"
            >
              <input
                name="q"
                type="text"
                placeholder="Block 123 Bishan Street 12, or any address…"
                className="flex-1 bg-transparent py-3 text-base placeholder:text-muted focus:outline-none"
                aria-label="Search Singapore property"
              />
              <button
                type="submit"
                className="font-display text-3xl text-cinnabar hover:translate-x-1 transition-transform px-2"
                aria-label="Analyse"
              >
                →
              </button>
            </form>

            <p className="rise [animation-delay:700ms] text-[11px] tracking-wide text-muted uppercase">
              <span className="text-jade">●</span> No signup.{" "}
              <span className="mx-1">·</span> Instant reading.{" "}
              <span className="mx-1">·</span> Detailed unit-level analysis after
              free signup.
            </p>
          </div>

          <aside className="lg:col-span-5 flex flex-col items-start lg:items-end gap-6 rise [animation-delay:500ms]">
            <LoShuGrid />
            <div className="text-left lg:text-right">
              <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-1">
                The Current Period
              </div>
              <div className="font-cn font-black text-[4rem] sm:text-[5rem] text-cinnabar leading-[0.85]">
                九紫
              </div>
              <div className="numeral text-sm tracking-wide text-ink-soft mt-2">
                2024 &mdash; 2043
              </div>
              <div className="font-cn text-xs text-muted mt-1 tracking-wider">
                玄空飞星 · 下元第九运
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="border-t border-line-soft">
        <div className="mx-auto max-w-7xl px-6 sm:px-10 py-3 flex items-center justify-between text-[10px] tracking-[0.3em] uppercase text-muted">
          <span>Free reading · 免费基础分析</span>
          <span className="hidden sm:inline">fengshuiai.sg</span>
        </div>
      </div>
    </section>
  );
}

function LoShuGrid() {
  const grid = [4, 9, 2, 3, 5, 7, 8, 1, 6];
  return (
    <figure className="space-y-2">
      <div className="inline-grid grid-cols-3 border border-line bg-surface shadow-[0_1px_0_0_rgba(28,20,14,0.04),0_8px_24px_-12px_rgba(28,20,14,0.15)]">
        {grid.map((n, i) => (
          <div
            key={i}
            className={`numeral w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center text-2xl sm:text-3xl border border-line-soft transition-colors hover:bg-bg-warm ${
              n === 5 ? "text-cinnabar bg-bg-warm" : "text-ink"
            }`}
          >
            {n}
          </div>
        ))}
      </div>
      <figcaption className="text-[10px] tracking-[0.3em] uppercase text-muted">
        Lo Shu · 洛书 · the nine-square chart
      </figcaption>
    </figure>
  );
}

function BaguaWatermark() {
  return (
    <svg
      aria-hidden
      className="absolute -right-32 -top-32 w-[600px] h-[600px] opacity-[0.04] text-ink pointer-events-none hidden lg:block"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
    >
      <circle cx="100" cy="100" r="98" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="70" strokeWidth="0.5" />
      <circle cx="100" cy="100" r="40" strokeWidth="0.5" />
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i * 15 * Math.PI) / 180;
        const x1 = 100 + 40 * Math.sin(angle);
        const y1 = 100 - 40 * Math.cos(angle);
        const x2 = 100 + 98 * Math.sin(angle);
        const y2 = 100 - 98 * Math.cos(angle);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth="0.4"
          />
        );
      })}
    </svg>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Pin your property",
      titleCn: "选址",
      body: "Drop a pin anywhere on Singapore. Type your address. Or browse our index of every HDB block and condo.",
      meta: "Instant · No signup",
    },
    {
      number: "02",
      title: "Read the surroundings",
      titleCn: "勘察形势",
      body: "Form school assessment of nearby cemeteries, hospitals, parks, MRT, and roads. Each factor with its classical reference.",
      meta: "Free preview · Email for full",
    },
    {
      number: "03",
      title: "Go to unit level",
      titleCn: "深入飞星",
      body: "Sign up to upload your floor plan for flying stars and eight mansions analysis on your specific unit.",
      meta: "Free · Sign-in required",
    },
  ];

  return (
    <section className="border-b border-line bg-surface relative">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-28">
        <header className="mb-16 flex items-baseline justify-between border-b border-line pb-6">
          <div>
            <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
              I. The Method
            </div>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em] max-w-2xl">
              How it works.
            </h2>
          </div>
          <div className="hidden sm:block text-right">
            <div className="font-cn text-2xl text-cinnabar">三步</div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-muted mt-1">
              Three steps
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
          {steps.map((s) => (
            <article key={s.number} className="space-y-5">
              <div className="numeral text-[5.5rem] text-cinnabar leading-none">
                {s.number}.
              </div>
              <div className="pt-4 border-t-2 border-ink">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="font-display text-2xl tracking-tight">
                    {s.title}
                  </h3>
                  <span className="font-cn text-base text-muted">
                    {s.titleCn}
                  </span>
                </div>
                <p className="text-ink-soft leading-relaxed">{s.body}</p>
                <p className="text-[10px] tracking-[0.3em] uppercase text-jade mt-4">
                  {s.meta}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Methodology() {
  const principles = [
    {
      en: "Form",
      cn: "峦头",
      note: "Surrounding terrain, water, roads, neighbours. The macro environment of a property.",
    },
    {
      en: "Direction",
      cn: "方位",
      note: "24-mountain facing. Sit and face calibration to one of 15° sectors.",
    },
    {
      en: "Period",
      cn: "运",
      note: "We are in Period 9 — the era of fire, vision, and the middle daughter (2024–2043).",
    },
    {
      en: "Sectors",
      cn: "宫位",
      note: "Lo Shu nine-square overlay on the floor plan. Each cell carries its own qi.",
    },
  ];

  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
          <header className="lg:col-span-5">
            <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
              II. The Readings
            </div>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em]">
              Four lenses.{" "}
              <em className="text-cinnabar italic font-normal">One home.</em>
            </h2>
            <p className="mt-8 max-w-md text-ink-soft leading-relaxed">
              We draw on classical fengshui — not invented logic. Every factor
              in your reading names its source so you can verify, dispute, or
              learn from it.
            </p>
            <blockquote className="mt-10 pl-5 border-l-2 border-cinnabar text-ink-soft italic font-display text-xl leading-snug">
              &ldquo;The qi rides the wind and scatters; it halts at the
              water&rsquo;s edge.&rdquo;
              <footer className="not-italic font-body text-xs text-muted mt-3 tracking-wider uppercase">
                — Guo Pu, <span className="font-cn">葬书</span> · 4th c.
              </footer>
            </blockquote>
          </header>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-12">
            {principles.map((p, i) => (
              <article key={p.en} className="border-t border-ink pt-5">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-display text-3xl tracking-tight">
                    <span className="numeral text-base text-muted mr-2 align-top">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {p.en}
                  </span>
                  <span className="font-cn text-3xl text-cinnabar">{p.cn}</span>
                </div>
                <p className="text-sm text-muted leading-relaxed">{p.note}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

