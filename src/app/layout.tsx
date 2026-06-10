import type { Metadata } from "next";
import { Fraunces, Manrope, Noto_Serif_SC } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-cn",
  weight: ["400", "600", "900"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // www is the live canonical (the apex 308-redirects to it), so metadataBase —
  // which resolves canonical + OG URLs — must match, or tags point at a URL that
  // immediately redirects.
  metadataBase: new URL("https://www.fengshuiai.sg"),
  title: {
    default: "Fengshui AI — AI-powered fengshui analysis for Singapore property",
    template: "%s | Fengshui AI",
  },
  description:
    "Free AI fengshui analysis of any Singapore property. Map-based location analysis instantly, detailed unit-level analysis after a free, verified account.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Fengshui AI",
    description:
      "Free AI fengshui analysis of any Singapore property. Map-based location analysis instantly, detailed unit-level analysis after a free, verified account.",
    url: "https://www.fengshuiai.sg",
    siteName: "Fengshui AI",
    locale: "en_SG",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} ${notoSerifSC.variable}`}
    >
      <body className="min-h-screen flex flex-col antialiased">
        {children}
        {/* Cookieless, aggregate page analytics (top-of-funnel). Enable in
            Vercel → Project → Analytics. No PII / no ad trackers — consistent
            with the privacy policy. */}
        <Analytics />
        {/* PostHog product analytics (init + pageviews) lives in
            src/instrumentation-client.ts — no component needed. */}
      </body>
    </html>
  );
}
