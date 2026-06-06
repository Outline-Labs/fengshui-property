"use client";

import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect } from "react";

// PostHog product analytics. Initialises only when NEXT_PUBLIC_POSTHOG_KEY is
// set, so this is a safe no-op until the project key is configured (and in any
// preview without it). EU host by default for PDPA data residency.
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

export function PostHogAnalytics() {
  useEffect(() => {
    if (!KEY || posthog.__loaded) return;
    posthog.init(KEY, {
      api_host: HOST,
      // Only persist a person profile once we identify(leadId) — keeps anonymous
      // traffic cheap while still recording its events for funnels.
      person_profiles: "identified_only",
      // App Router does client-side navigation; we capture $pageview manually
      // below so route changes are tracked correctly.
      capture_pageview: false,
      capture_pageleave: true,
    });
  }, []);

  if (!KEY) return null;
  return (
    <Suspense fallback={null}>
      <PageView />
    </Suspense>
  );
}

function PageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!KEY || !pathname || !posthog.__loaded) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);
  return null;
}
