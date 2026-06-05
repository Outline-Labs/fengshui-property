// Allowlisted consumer hosts, used to build absolute return URLs for Stripe
// Checkout so a forged Host header can't redirect a paying user (and their
// session) to an attacker domain. Mirrors lib/partner-hosts for the consumer
// surface. Override the list with CONSUMER_HOSTS (comma-separated).

const DEFAULT_CONSUMER_HOSTS =
  "fengshuiai.sg,www.fengshuiai.sg,fengshuiai-nine.vercel.app,localhost";

export function consumerHosts(): string[] {
  return (process.env.CONSUMER_HOSTS ?? DEFAULT_CONSUMER_HOSTS)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * A SAFE host for absolute consumer links. Echoes the request host (incl. port,
 * so localhost:3000 survives in dev) only when it's allowlisted; otherwise
 * falls back to the canonical production host.
 */
export function safeConsumerHost(hostHeader: string | null | undefined): string {
  const hosts = consumerHosts();
  const bare = (hostHeader ?? "").toLowerCase().split(":")[0];
  if (hostHeader && hosts.includes(bare)) return hostHeader;
  return hosts.find((h) => !h.includes("localhost")) ?? "fengshuiai.sg";
}
