import { redirect } from "next/navigation";

import { getAgent } from "@/lib/agents";
import { createAgentSession, readMagicToken } from "@/lib/session";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const agentId = readMagicToken(token);
  if (agentId) {
    const agent = await getAgent(agentId);
    if (agent && agent.status === "approved") {
      await createAgentSession(agentId);
      redirect("/dashboard");
    }
  }
  redirect("/login?error=link");
}
