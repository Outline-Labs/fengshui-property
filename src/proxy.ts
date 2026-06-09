import { NextResponse, type NextRequest } from "next/server";

import { isPartnerHost } from "@/lib/partner-hosts";
import { partnersEnabled } from "@/lib/partners";

function isPartnerPath(path: string): boolean {
  // The partner surface is exactly /p and everything under /p/. Must NOT match
  // consumer pages that merely start with "p" (/privacy, /period-9, /pdpa).
  return path === "/p" || path.startsWith("/p/");
}

// Holding page served during a temporary maintenance takedown (MAINTENANCE_MODE).
const MAINTENANCE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Fengshui AI — back soon</title><style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5efe6;color:#1c140e;font-family:ui-serif,Georgia,"Times New Roman",serif;text-align:center;padding:2rem}.w{max-width:30rem}.m{font-size:1.5rem;letter-spacing:-.01em}.d{color:#8b2c1c;margin:0 .15rem}h1{font-size:2rem;font-weight:600;margin:1.5rem 0 .75rem;line-height:1.1}p{color:#2a1f15;line-height:1.65;font-size:1rem;font-family:ui-sans-serif,system-ui,sans-serif}.r{width:3rem;height:4px;background:#8b2c1c;margin:1.75rem auto 0}</style></head><body><div class="w"><div class="m">Fengshui<span class="d">·</span>AI</div><h1>We&rsquo;ll be back shortly.</h1><p>We&rsquo;re putting the finishing touches in place. Please check back soon — 谢谢。</p><div class="r"></div></div></body></html>`;

function isMaintenance(): boolean {
  const m = process.env.MAINTENANCE_MODE;
  return m === "true" || m === "1";
}

export function proxy(request: NextRequest) {
  // Temporary, env-gated maintenance takedown — runs before everything. The
  // matcher already excludes /api, _next, favicon, robots, sitemap, so webhooks
  // (e.g. Revolut) and static assets keep working. Reverse: unset
  // MAINTENANCE_MODE and redeploy. 503 + Retry-After keeps it SEO-safe.
  if (isMaintenance()) {
    return new NextResponse(MAINTENANCE_HTML, {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "3600",
        "cache-control": "no-store",
      },
    });
  }

  const path = request.nextUrl.pathname;

  // Kill switch (consumer-only launch): with the partner surface off, the agent
  // dashboard is unreachable everywhere — /p 404s and the partner host is not
  // routed (it falls through to the consumer site). Re-enable with
  // PARTNERS_ENABLED=true.
  if (!partnersEnabled()) {
    if (isPartnerPath(path)) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  const host = request.headers.get("host") ?? "";
  const partner = isPartnerHost(host);

  // The agent surface lives only on the partner host. Block any /p access from
  // the consumer host so the funnel can't leak through a guessed URL.
  if (!partner && isPartnerPath(path) && process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  let res: NextResponse;
  if (partner && !isPartnerPath(path)) {
    // Partners see clean URLs (/dashboard); rewrite them onto /p internally.
    const url = request.nextUrl.clone();
    url.pathname = `/p${path === "/" ? "" : path}`;
    res = NextResponse.rewrite(url);
  } else {
    res = NextResponse.next();
  }

  if (partner) {
    // Belt-and-suspenders over per-page noindex metadata: keep the entire
    // partner subdomain out of search results (incl. CSV export + redirects)
    // so consumers never discover we route their data to agents.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
