import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  experimental: {
    serverActions: {
      // Floor-plan uploads arrive as resized base64 data URLs via a server action.
      bodySizeLimit: "6mb",
    },
  },
  // Route PostHog through Next.js to avoid ad-blockers and keep EU data residency.
  // Both /static/* and /array/* must route to the assets origin per PostHog docs.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  // Required to support PostHog trailing slash API requests.
  skipTrailingSlashRedirect: true,
  // Baseline security headers on every response. (CSP is intentionally omitted
  // for now — it needs a careful rollout so it doesn't break MapLibre/Tailwind.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // anti-clickjacking
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak full URLs (incl. magic-link tokens) cross-origin.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
