import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored static assets (e.g. the pdf.js worker) — not our source.
    "public/**",
  ]),
  {
    // The partner surface is served on partners.fengshuiai.sg and routed to
    // /p/* by a hostname proxy (src/proxy.ts). Internal links must trigger a
    // full-page navigation so the proxy rewrite applies; client-side <Link>
    // would bypass it. Plain <a> is intentional here.
    files: ["src/app/p/**", "src/components/partners-masthead.tsx"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
