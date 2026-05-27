export function SiteFooter() {
  return (
    <footer className="bg-ink text-bg">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 py-16">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 mb-12">
          <div className="col-span-2 sm:col-span-1">
            <div className="font-display text-2xl">
              Fengshui<span className="text-cinnabar mx-0.5">·</span>AI
            </div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-bg/50 mt-2">
              Singapore <span className="font-cn">新加坡</span>
            </div>
            <p className="text-xs text-bg/60 leading-relaxed mt-5 max-w-[14rem]">
              Cultural and traditional analysis for educational purposes. For
              formal audit, consult a certified master.
            </p>
          </div>

          <FooterCol
            title="Read"
            links={[
              ["Map", "/map"],
              ["Method", "/method"],
              ["Period 9", "/period-9"],
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
              ["PDPA", "/pdpa"],
            ]}
          />
        </div>
        <div className="border-t border-bg/10 pt-6 flex flex-wrap items-center justify-between gap-3 text-[10px] tracking-[0.3em] uppercase text-bg/50">
          <span>
            © 2026 · Outline Labs · Volume 01 · Period{" "}
            <span className="font-cn text-bg/70">九</span>
          </span>
          <span className="font-cn text-bg/60 tracking-normal text-xs">
            新加坡风水分析
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.3em] uppercase text-bg/40 mb-4">
        {title}
      </div>
      <ul className="space-y-2.5">
        {links.map(([label, href]) => (
          <li key={href}>
            <a
              href={href}
              className="text-sm text-bg/80 hover:text-cinnabar transition-colors"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
