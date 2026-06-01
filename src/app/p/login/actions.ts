"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getApprovedAgentByEmail } from "@/lib/agents";
import { sendEmail } from "@/lib/email";
import { safePartnerHost } from "@/lib/partner-hosts";
import { createMagicToken } from "@/lib/session";

export async function agentLogin(formData: FormData) {
  const email = (formData.get("email")?.toString() ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/login?error=email");
  }

  const agent = await getApprovedAgentByEmail(email);
  if (agent) {
    const token = createMagicToken(agent.id);
    const h = await headers();
    // Allowlist the host so a forged Host header can't point the sign-in link
    // at an attacker domain that would capture the token.
    const host = safePartnerHost(h.get("host"));
    const proto = host.includes("localhost") ? "http" : "https";
    const link = `${proto}://${host}/login/verify?token=${encodeURIComponent(token)}`;
    await sendEmail(
      email,
      "Your Fengshui AI Partners sign-in link",
      `Sign in to your partner dashboard:\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
    );
  }

  // Always report "sent" — never reveal whether an email is a registered agent.
  redirect("/login?sent=1");
}
