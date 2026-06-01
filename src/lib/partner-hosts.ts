// Shared agent-surface host logic, used by both the proxy (host-based routing)
// and the magic-link builder. Pure (env + strings only) so it's safe in the
// Edge middleware runtime as well as Node server code.

const DEFAULT_PARTNER_HOSTS = "partners.fengshuiai.sg,partners.localhost";

export function partnerHosts(): string[] {
  return (process.env.PARTNER_HOSTS ?? DEFAULT_PARTNER_HOSTS)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isPartnerHost(host: string): boolean {
  const bare = host.toLowerCase().split(":")[0];
  return partnerHosts().includes(bare);
}

/**
 * A SAFE host for building absolute partner links (e.g. magic-link emails).
 * Echoes the request host only if it's an allowed partner host; otherwise
 * falls back to the canonical production host. This blocks host-header
 * injection from pointing a sign-in link at an attacker-controlled domain.
 */
export function safePartnerHost(hostHeader: string | null | undefined): string {
  const hosts = partnerHosts();
  const bare = (hostHeader ?? "").toLowerCase().split(":")[0];
  // Keep the full header (incl. port) when it's an allowed host — preserves
  // partners.localhost:3000 in dev.
  if (hostHeader && hosts.includes(bare)) return hostHeader;
  return hosts.find((h) => !h.includes("localhost")) ?? "partners.fengshuiai.sg";
}
