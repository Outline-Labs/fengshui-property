"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { sendMagicLink } from "@/lib/auth-email";
import { getLead, getLeadByEmail } from "@/lib/leads";
import { getPostHogClient } from "@/lib/posthog-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { destroySession, getLeadId } from "@/lib/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Passwordless login: email a one-time magic link to a registered lead. Always
 * reports "sent" regardless of whether the email is registered — never reveal
 * account existence. Rate-limited per email (anti-bombing) and per IP.
 */
export async function consumerLogin(formData: FormData) {
  const email = (formData.get("email")?.toString() ?? "").trim();
  if (!EMAIL_RE.test(email)) redirect("/login?error=email");

  const h = await headers();
  const ip = clientIp(h);
  const byEmail = await rateLimit({
    key: `login-email:${email.toLowerCase()}`,
    limit: 5,
    windowMs: 15 * 60_000,
  });
  const byIp = await rateLimit({
    key: `login-ip:${ip}`,
    limit: 20,
    windowMs: 15 * 60_000,
  });
  if (byEmail.ok && byIp.ok) {
    const lead = await getLeadByEmail(email);
    if (lead) {
      await sendMagicLink({
        email,
        leadId: lead.id,
        hostHeader: h.get("host"),
        kind: "login",
      });
      const ph = getPostHogClient();
      if (ph) {
        ph.capture({ distinctId: lead.id, event: "login_requested" });
        await ph.flush(); // deliver before the action redirects (serverless)
      }
    }
  }
  // Always "sent" — don't leak whether the email belongs to an account.
  redirect("/login?sent=1");
}

/** Resend the verification link to the signed-in lead (from the /upload banner). */
export async function resendVerification() {
  const leadId = await getLeadId();
  if (!leadId) redirect("/signup?next=/upload");
  const lead = await getLead(leadId);
  if (lead && !lead.emailVerified) {
    const h = await headers();
    await sendMagicLink({
      email: lead.email,
      leadId,
      hostHeader: h.get("host"),
      kind: "verify",
    });
  }
  redirect("/upload?verify=sent");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
