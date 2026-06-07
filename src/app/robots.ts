import type { MetadataRoute } from "next";

// Crawl rules for the consumer host. Allow everything public; disallow the agent
// surface (/p/*) and API routes — the agent surface must stay invisible (the
// proxy also sets x-robots-tag: noindex on the partner host as the real guard).
// host + sitemap point at the www canonical (the apex 308-redirects to it).
const BASE = "https://www.fengshuiai.sg";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/p/", "/api/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
