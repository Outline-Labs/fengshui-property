import { redirect } from "next/navigation";

import { getAgent } from "@/lib/agents";
import { getPostHogClient } from "@/lib/posthog-server";
import { createAgentSession, readMagicToken } from "@/lib/session";
import { consumeToken } from "@/lib/used-tokens";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const agentId = readMagicToken(token);
  // Single-use: consume before acting, so a replayed link can't re-mint a session.
  if (agentId && (await consumeToken(token))) {
    const agent = await getAgent(agentId);
    if (agent && agent.status === "approved") {
      await createAgentSession(agentId);
      const ph = getPostHogClient();
      if (ph) {
        ph.identify({
          distinctId: agentId,
          properties: { email: agent.email, name: agent.name, agency: agent.agency },
        });
        await ph.flush(); // deliver before the handler redirects (serverless)
      }
      redirect("/dashboard");
    }
  }
  redirect("/login?error=link");
}
