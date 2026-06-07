import type { MetadataRoute } from "next";

// Public consumer pages only. The agent surface (/p/*) is deliberately omitted —
// it must stay invisible to consumers and search engines (see the proxy's
// x-robots-tag noindex + the disallow in robots.ts). Functional/gated routes
// (/signup, /upload) are excluded too: they're behind the email gate and not
// useful as crawl targets. Uses the www canonical (apex 308-redirects to it).
const BASE = "https://www.fengshuiai.sg";

// A single launch baseline — bump on a meaningful content change. Kept constant
// (not new Date()) so the generated sitemap stays deterministic and statically
// cached rather than churning its lastmod on every deploy.
const LAST_MODIFIED = "2026-06-07";

export default function sitemap(): MetadataRoute.Sitemap {
  const page = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  ) => ({
    url: `${BASE}${path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency,
    priority,
  });

  return [
    page("/", 1.0, "weekly"), // home — primary landing
    page("/map", 0.9, "weekly"), // instant map-based analysis (top of funnel)
    page("/method", 0.8, "monthly"), // how it works — SEO content
    page("/period-9", 0.8, "monthly"), // flying-stars Period 9 — SEO content
    page("/privacy", 0.3, "yearly"),
    page("/pdpa", 0.3, "yearly"),
    page("/terms", 0.3, "yearly"),
  ];
}
