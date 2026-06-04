import { NextResponse, type NextRequest } from "next/server";

import { isPartnerHost } from "@/lib/partner-hosts";

function isPartnerPath(path: string): boolean {
  // The partner surface is exactly /p and everything under /p/. Must NOT match
  // consumer pages that merely start with "p" (/privacy, /period-9, /pdpa).
  return path === "/p" || path.startsWith("/p/");
}

/**
 * Whether the agent (partner) surface is live.
 *
 * OFF for the consumer-only first production release: in production the agent
 * dashboard is unreachable — every /p path 404s and the partner host gets no
 * special routing (it just serves the consumer site). Defaults ON outside
 * production so the team keeps building it locally and in tests.
 * `PARTNERS_ENABLED=true|false` overrides either way (e.g. to turn it on for a
 * staging deploy, or to rehearse the consumer-only posture locally).
 */
function partnersEnabled(): boolean {
  const v = process.env.PARTNERS_ENABLED;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return process.env.NODE_ENV !== "production";
}

export function proxy(request: NextRequest) {
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
