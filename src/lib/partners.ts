// Whether the agent (partner) surface is live. This gates BOTH the partner
// dashboard (via src/proxy.ts) AND the consumer-facing "talk to a specialist"
// lead-capture CTA — so the first consumer-only release never reveals property
// agents to users.
//
// OFF in production by default; ON outside production (dev/tests) so the team
// keeps building it; PARTNERS_ENABLED=true|false overrides either way.
// Pure (env + strings only) so it's safe in the Edge middleware runtime too.
export function partnersEnabled(): boolean {
  const v = process.env.PARTNERS_ENABLED;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return process.env.NODE_ENV !== "production";
}
