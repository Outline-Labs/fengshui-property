import { redirect } from "next/navigation";

import { getLead, markEmailVerified } from "@/lib/leads";
import { getPostHogClient } from "@/lib/posthog-server";
import { createSession, readLoginToken } from "@/lib/session";

// Consumes a magic link: validates the token, signs the lead in, and marks the
// email verified (clicking the link proves ownership). force-dynamic so it's
// never cached. Runs on the consumer host (the proxy only special-cases /p/*).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const leadId = readLoginToken(token);
  if (leadId) {
    const lead = await getLead(leadId);
    if (lead) {
      await createSession(leadId);
      await markEmailVerified(leadId);
      const ph = getPostHogClient();
      if (ph) {
        ph.capture({ distinctId: leadId, event: "email_verified" });
        await ph.flush(); // deliver before the handler redirects (serverless)
      }
      redirect("/upload");
    }
  }
  redirect("/login?error=link");
}
