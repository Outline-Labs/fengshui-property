import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  experimental: {
    serverActions: {
      // Floor-plan uploads arrive as resized base64 data URLs via a server action.
      bodySizeLimit: "6mb",
    },
  },
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
