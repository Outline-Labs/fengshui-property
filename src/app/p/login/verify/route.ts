import { redirect } from "next/navigation";

import { getAgent } from "@/lib/agents";
import { getPostHogClient } from "@/lib/posthog-server";
import { createAgentSession, readMagicToken } from "@/lib/session";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const agentId = readMagicToken(token);
  if (agentId) {
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
