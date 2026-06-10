import type { MetadataRoute } from "next";

// Crawl rules for the consumer host. Allow everything public; disallow API
// routes. We deliberately do NOT name the agent surface (/p/*) here — listing it
// in a public robots.txt would advertise the hidden path. The partner surface
// stays out of search via the proxy's x-robots-tag: noindex and per-page noindex
// metadata, which are the real guards.
// host + sitemap point at the www canonical (the apex 308-redirects to it).
const BASE = "https://www.fengshuiai.sg";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
