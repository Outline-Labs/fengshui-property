import "server-only";

import { safeConsumerHost } from "./consumer-hosts";
import { sendEmail } from "./email";
import { createLoginToken } from "./session";

/**
 * Email a passwordless magic link to a lead. The same link both verifies email
 * ownership and signs them in (consumed at /login/verify). The host comes from
 * the request but is allowlisted via safeConsumerHost, so a forged Host header
 * can't point the link at an attacker domain that would capture the token.
 */
export async function sendMagicLink(p: {
  email: string;
  leadId: string;
  hostHeader: string | null | undefined;
  kind: "verify" | "login";
}): Promise<void> {
  const host = safeConsumerHost(p.hostHeader);
  const proto = host.includes("localhost") ? "http" : "https";
  const link = `${proto}://${host}/login/verify?token=${encodeURIComponent(
    createLoginToken(p.leadId),
  )}`;
  const subject =
    p.kind === "verify"
      ? "Verify your email · Fengshui AI"
      : "Your Fengshui AI sign-in link";
  const intro =
    p.kind === "verify"
      ? "Confirm your email to unlock your free fengshui readings and secure your account:"
      : "Sign in to Fengshui AI:";
  await sendEmail(
    p.email,
    subject,
    `${intro}\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, you can safely ignore this email.`,
  );
}
