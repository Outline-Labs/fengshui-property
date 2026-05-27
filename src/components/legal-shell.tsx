import { SiteFooter } from "@/components/site-footer";
import { SiteMasthead } from "@/components/site-masthead";

export function LegalShell({
  title,
  cn,
  updated,
  intro,
  children,
}: {
  title: string;
  cn: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteMasthead />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 py-12 sm:py-16">
          <header className="border-b border-line pb-8">
            <div className="text-[10px] tracking-[0.35em] uppercase text-muted mb-3 flex flex-wrap gap-x-3">
              <span>Legal</span>
              <span className="text-cinnabar">·</span>
              <span className="font-cn tracking-normal text-ink-soft">{cn}</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-[0.98] tracking-[-0.02em]">
              {title}
            </h1>
            <p className="mt-5 text-ink-soft leading-relaxed">{intro}</p>
            <div className="mt-5 text-[10px] tracking-[0.3em] uppercase text-muted">
              Last updated {updated} · Outline Labs · fengshuiai.sg
            </div>
          </header>
          <div className="mt-12 space-y-10">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

export function LegalSection({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-2xl tracking-tight mb-3">
        <span className="numeral text-cinnabar text-base mr-2 align-baseline">
          {n}
        </span>
        {title}
      </h2>
      <div className="space-y-3 text-ink-soft leading-relaxed text-sm sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}
