"use client";

import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect } from "react";

// PostHog is initialized in instrumentation-client.ts. This component only
// handles manual $pageview capture for App Router client-side navigation.
const KEY = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

export function PostHogAnalytics() {
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
    if (!KEY || !pathname) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);
  return null;
}
