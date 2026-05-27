import { NextResponse, type NextRequest } from "next/server";

const PARTNER_HOSTS = ["partners.fengshuiai.sg", "partners.localhost"];

function isPartnerHost(host: string): boolean {
  const bare = host.toLowerCase().split(":")[0];
  return PARTNER_HOSTS.includes(bare);
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const path = request.nextUrl.pathname;
  const partner = isPartnerHost(host);

  // The agent surface lives only on the partner host. Block any /p access from
  // the consumer host so the funnel can't leak through a guessed URL.
  if (
    !partner &&
    path.startsWith("/p") &&
    process.env.NODE_ENV === "production"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  let res: NextResponse;
  if (partner && !path.startsWith("/p")) {
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
