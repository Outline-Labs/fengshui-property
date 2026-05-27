import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { SiteMasthead } from "@/components/site-masthead";

export const metadata: Metadata = {
  title: "Period 9 (2024–2043) · Fengshui AI",
  description:
    "We are in Period 9 (下元九运, 2024–2043) — the era of the 9 Purple star, the Li trigram, and fire. What changed in 2024 and what it means for Singapore property.",
};

const FAVOURS = [
  {
    en: "Fire & light",
    cn: "火",
    body: "Illumination, energy, technology, beauty, vision. Industries of the screen and the spotlight rise.",
  },
  {
    en: "The South",
    cn: "離",
    body: "The Li trigram sits south. South-facing and south-sector energy is strengthened through 2043.",
  },
  {
    en: "The middle daughter",
    cn: "中女",
    body: "Period 9 favours women in the middle of life — and the clarity, taste, and discernment they carry.",
  },
];

export default function Period9Page() {
  return (
    <>
      <SiteMasthead />
      <main className="flex-1">
        <section className="border-b border-line relative overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 pt-12 pb-16 sm:pt-16 sm:pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7">
                <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-4 flex flex-wrap gap-x-3">
                  <span>The Current Period</span>
                  <span className="text-cinnabar">·</span>
                  <span>2024 — 2043</span>
                </div>
                <h1 className="font-display text-[clamp(2.5rem,7vw,5rem)] leading-[0.98] tracking-[-0.025em]">
                  The age of{" "}
                  <em className="text-cinnabar italic font-normal">fire.</em>
                </h1>
                <p className="mt-7 max-w-xl text-lg text-ink-soft leading-relaxed">
                  On the 4th of February 2024, fengshui turned a page. We left
                  Period 8 — twenty years of earth and mountains — and entered{" "}
                  <span className="text-ink">Period 9</span>, ruled by the 9
                  Purple star. Every building&rsquo;s stars were re-weighted.
                </p>
              </div>
              <div className="lg:col-span-5 flex justify-start lg:justify-end">
                <div className="text-left lg:text-right">
                  <div className="font-cn font-black text-[6rem] sm:text-[8rem] text-cinnabar leading-[0.8]">
                    九紫
                  </div>
                  <div className="numeral text-sm tracking-wide text-ink-soft mt-3">
                    Nine Purple · Li ☲
                  </div>
                  <div className="font-cn text-xs text-muted mt-1 tracking-wider">
                    下元 · 第九运
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-5">
                <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
                  I. The cycle
                </div>
                <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em]">
                  Twenty years,{" "}
                  <em className="text-cinnabar italic font-normal">
                    nine times.
                  </em>
                </h2>
              </div>
              <div className="lg:col-span-7 space-y-6 text-ink-soft leading-relaxed">
                <p>
                  Time in Xuan Kong fengshui moves in three cycles of sixty
                  years — the Three Eras (三元) — each divided into three
                  twenty-year periods. Nine periods, one hundred and eighty
                  years, then the wheel turns again.
                </p>
                <p>
                  Each period crowns a ruling star that strengthens some
                  directions and tires others. Period 7 (1984–2003) was metal
                  and the lake. Period 8 (2004–2023) was earth and the mountain.
                  Now the 9 Purple star of fire governs until 2043.
                </p>
                <div className="border-t border-line pt-5 grid grid-cols-3 gap-4 max-w-md">
                  {[
                    ["7", "1984–2003", "Metal · 兌"],
                    ["8", "2004–2023", "Earth · 艮"],
                    ["9", "2024–2043", "Fire · 離"],
                  ].map(([n, yrs, el], i) => (
                    <div key={n} className={i === 2 ? "text-cinnabar" : ""}>
                      <div className="numeral text-3xl leading-none">{n}</div>
                      <div className="text-[10px] tracking-wide uppercase text-muted mt-2">
                        {yrs}
                      </div>
                      <div className="font-cn text-xs mt-1">{el}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
            <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3">
              II. What Period 9 favours
            </div>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em] mb-12 max-w-2xl">
              Where the energy{" "}
              <em className="text-cinnabar italic font-normal">gathers now.</em>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14">
              {FAVOURS.map((f) => (
                <article key={f.en} className="border-t-2 border-ink pt-5">
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="font-display text-2xl tracking-tight">
                      {f.en}
                    </h3>
                    <span className="font-cn text-2xl text-cinnabar">{f.cn}</span>
                  </div>
                  <p className="text-ink-soft leading-relaxed text-sm">
                    {f.body}
                  </p>
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
                  III. For your property
                </div>
                <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em]">
                  Your stars{" "}
                  <em className="text-cinnabar italic font-normal">moved.</em>
                </h2>
              </div>
              <div className="lg:col-span-7 space-y-6 text-ink-soft leading-relaxed">
                <p>
                  A home that prospered in Period 8 does not automatically
                  prosper in Period 9. The same walls, the same facing — but the
                  water star that brought wealth a year ago may now sit idle,
                  and a once-quiet sector may now carry the prosperous 9.
                </p>
                <p>
                  This is why a current reading matters. We compute your
                  unit&rsquo;s chart for Period 9, not the era it was built in,
                  and show you where the living energy sits today.
                </p>
                <div className="pt-2">
                  <a
                    href="/upload"
                    className="font-display text-xl text-cinnabar hover:translate-x-1 transition-transform inline-flex items-center gap-2"
                  >
                    Read your unit for Period 9 <span aria-hidden>→</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
