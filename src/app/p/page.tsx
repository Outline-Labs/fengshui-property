export default function PartnersLanding() {
  return (
    <main className="flex-1">
      <Hero />
      <HowLeadsArrive />
      <Pricing />
      <WhyUs />
      <ApplyCTA />
      <PartnersFooter />
    </main>
  );
}

function Hero() {
  return (
    <section className="border-b border-bg/15 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
        <div className="text-[10px] tracking-[0.35em] uppercase text-bg/50 mb-4 flex flex-wrap gap-x-3">
          <span>Volume 01</span>
          <span className="text-cinnabar">·</span>
          <span>For RES specialists in Singapore</span>
          <span className="text-cinnabar">·</span>
          <span className="font-cn tracking-normal text-bg/70">合伙人</span>
        </div>
        <h1 className="font-display text-4xl sm:text-6xl lg:text-[4.5rem] leading-[0.98] tracking-[-0.025em] max-w-5xl">
          The buyers who care about{" "}
          <em className="text-cinnabar italic font-normal">fengshui</em>
          <br />
          already know your area.
        </h1>
        <p className="mt-8 max-w-2xl text-base sm:text-lg text-bg/75 leading-relaxed">
          Each lead has spent eight minutes analysing their target property,
          uploaded the floor plan, and asked for a local specialist. You
          receive a unit-level pitch package — not a phone number on a
          spreadsheet.
        </p>
        <div className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-4">
          <a
            href="/apply"
            className="font-display text-xl text-cinnabar hover:translate-x-1 transition-transform inline-flex items-center gap-2"
          >
            Apply with your invite code <span aria-hidden>→</span>
          </a>
          <a
            href="/login"
            className="text-sm text-bg/60 hover:text-bg transition-colors"
          >
            Already in? Sign in →
          </a>
        </div>
      </div>
    </section>
  );
}

function HowLeadsArrive() {
  const steps = [
    {
      number: "01",
      title: "Buyer reads their property",
      body: "On fengshuiai.sg they analyse their target unit on the map and upload the floor plan. They see what is auspicious and what is not — in their actual unit, not in the abstract.",
    },
    {
      number: "02",
      title: "Buyer asks for help",
      body: "At the end of the reading, they choose to be matched with a local property specialist who knows the area and respects fengshui. Their consent is captured here, in evidential form.",
    },
    {
      number: "03",
      title: "You claim the lead",
      body: "Hot leads (floor plan uploaded · phone provided) appear in your dashboard. First-come-first-serve, capped per agent per day. Pay only on claim.",
    },
  ];
  return (
    <section className="border-b border-bg/15">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
        <div className="text-[10px] tracking-[0.35em] uppercase text-bg/50 mb-3">
          I. How leads arrive
        </div>
        <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em] mb-12 max-w-2xl">
          Pre-qualified,{" "}
          <em className="text-cinnabar italic font-normal">
            not prospected.
          </em>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-14">
          {steps.map((s) => (
            <article key={s.number} className="space-y-4">
              <div className="numeral text-6xl text-cinnabar leading-none">
                {s.number}.
              </div>
              <div className="border-t-2 border-bg/30 pt-4">
                <h3 className="font-display text-2xl tracking-tight mb-2">
                  {s.title}
                </h3>
                <p className="text-bg/70 leading-relaxed text-sm">{s.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    {
      name: "Hot",
      cn: "热",
      price: "S$120",
      criteria: "Floor plan uploaded · Phone provided",
      claim: "Exclusive · 24h response window",
    },
    {
      name: "Warm",
      cn: "温",
      price: "S$50",
      criteria: "Phone provided · No floor plan",
      claim: "Top 2 agents per territory · 48h",
    },
    {
      name: "Cool",
      cn: "凉",
      price: "—",
      criteria: "Email only",
      claim: "Email nurture only · Not sold",
    },
  ];
  return (
    <section className="border-b border-bg/15">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <header className="lg:col-span-4">
            <div className="text-[10px] tracking-[0.35em] uppercase text-bg/50 mb-3">
              II. Pricing
            </div>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em] mb-6">
              Pay only on{" "}
              <em className="text-cinnabar italic font-normal">claim.</em>
            </h2>
            <p className="text-bg/70 leading-relaxed text-sm max-w-xs">
              No subscription. No minimums. Refunds allowed for genuinely
              invalid leads. Aggressive refunders lose claim priority — keeping
              the marketplace honest.
            </p>
          </header>
          <div className="lg:col-span-8 space-y-8">
            {tiers.map((t) => (
              <article
                key={t.name}
                className="border-t border-bg/30 pt-5 grid grid-cols-12 gap-4 items-baseline"
              >
                <div className="col-span-12 sm:col-span-3">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50">
                    Tier
                  </div>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="font-display text-2xl tracking-tight">
                      {t.name}
                    </span>
                    <span className="font-cn text-lg text-cinnabar">
                      {t.cn}
                    </span>
                  </div>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50">
                    Per claim
                  </div>
                  <div className="numeral text-3xl text-cinnabar mt-1">
                    {t.price}
                  </div>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50">
                    Includes
                  </div>
                  <div className="text-sm text-bg/85 mt-1 leading-snug">
                    {t.criteria}
                  </div>
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50">
                    Distribution
                  </div>
                  <div className="text-sm text-bg/85 mt-1 leading-snug">
                    {t.claim}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WhyUs() {
  const points = [
    {
      en: "Already screened",
      cn: "已筛选",
      body: "Every lead has spent eight or more minutes reading their property and asked for an agent on their own initiative.",
    },
    {
      en: "Pitch package included",
      cn: "推介材料",
      body: "Each claim unlocks the full unit-level analysis — material no agent could produce alone without commissioning a master.",
    },
    {
      en: "Built for Singapore",
      cn: "本地化",
      body: "Every HDB block, every condo, every landed lot. Period 9 flying-stars, 24-mountain compass, OneMap-authoritative coordinates.",
    },
    {
      en: "PDPA-aligned",
      cn: "合规",
      body: "Consent is captured at lead generation, in evidential form. We hold the audit trail. You contact within scope.",
    },
  ];
  return (
    <section className="border-b border-bg/15">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
        <div className="text-[10px] tracking-[0.35em] uppercase text-bg/50 mb-3">
          III. Why us
        </div>
        <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em] mb-12 max-w-2xl">
          Not another{" "}
          <em className="text-cinnabar italic font-normal">lead reseller.</em>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-12 max-w-5xl">
          {points.map((p) => (
            <article key={p.en} className="border-t border-bg/30 pt-5">
              <div className="flex items-baseline justify-between mb-3">
                <span className="font-display text-2xl tracking-tight">
                  {p.en}
                </span>
                <span className="font-cn text-xl text-cinnabar">{p.cn}</span>
              </div>
              <p className="text-sm text-bg/70 leading-relaxed">{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ApplyCTA() {
  return (
    <section className="border-b border-bg/15">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 py-20 sm:py-24">
        <div className="max-w-3xl">
          <div className="text-[10px] tracking-[0.35em] uppercase text-bg/50 mb-3">
            IV. The application
          </div>
          <h2 className="font-display text-4xl sm:text-5xl leading-tight tracking-[-0.02em] mb-6">
            Invite-only.{" "}
            <em className="text-cinnabar italic font-normal">By design.</em>
          </h2>
          <p className="text-bg/70 leading-relaxed mb-10 text-base">
            We onboard a small number of top RES specialists per estate. If
            you received an invitation from us or a peer, use the code from
            the email to apply. Otherwise, leave us a note and we&rsquo;ll
            write back when we open your district.
          </p>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <a
              href="/apply"
              className="font-display text-xl text-cinnabar hover:translate-x-1 transition-transform inline-flex items-center gap-2"
            >
              I have an invite code <span aria-hidden>→</span>
            </a>
            <a
              href="mailto:partners@fengshuiai.sg"
              className="text-sm text-bg/70 hover:text-bg transition-colors"
            >
              No code yet · partners@fengshuiai.sg
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function PartnersFooter() {
  return (
    <footer className="py-12 mt-auto">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 flex flex-wrap items-center justify-between gap-3 text-[10px] tracking-[0.3em] uppercase text-bg/40">
        <span>
          © 2026 · Fengshui AI · Volume{" "}
          <span className="numeral">01</span> · Partners surface
        </span>
        <span className="font-cn text-xs tracking-normal text-bg/50">
          新加坡 · 风水分析 · 合伙人
        </span>
      </div>
    </footer>
  );
}
