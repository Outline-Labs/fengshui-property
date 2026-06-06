import posthog from "posthog-js";

const TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (TOKEN) {
  posthog.init(TOKEN, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-01-30",
    person_profiles: "identified_only",
    // Captured manually below, from THIS (the initialised) instance — a separate
    // component import of posthog-js is a different bundled instance and its
    // capture() calls silently no-op.
    capture_pageview: false,
    capture_pageleave: true,
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
  // Expose the initialised instance (the official snippet does this too) — handy
  // for debugging and for any non-React call site.
  (window as unknown as { posthog: typeof posthog }).posthog = posthog;
  // First load. onRouterTransitionStart (below) only fires on later navigations.
  posthog.capture("$pageview");
}

// Next App Router calls this when a client-side navigation begins; `url` is the
// destination path. Capturing the pageview here keeps it on the initialised
// instance and works for SPA navigation.
export function onRouterTransitionStart(url: string) {
  if (TOKEN) {
    posthog.capture("$pageview", { $current_url: window.location.origin + url });
  }
}
