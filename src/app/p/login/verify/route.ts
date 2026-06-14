import { redirect } from "next/navigation";

import { getAgent } from "@/lib/agents";
import { getPostHogClient } from "@/lib/posthog-server";
import { createAgentSession, readMagicToken } from "@/lib/session";
import { consumeToken } from "@/lib/used-tokens";

export const dynamic = "force-dynamic";

// GET is idempotent (validate + render a confirm page); the POST consumes the
// single-use token and signs in. Same prefetch-safety reasoning as the consumer
// /login/verify route: email scanners / browser prefetch GET the link before the
// human clicks, so consuming on GET would burn the token and break sign-in.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!readMagicToken(token)) redirect("/login?error=link");
  return new Response(confirmPage(token), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = form?.get("token")?.toString() ?? "";
  const agentId = readMagicToken(token);
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function confirmPage(token: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Sign in</title><style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5efe6;color:#1c140e;font-family:ui-serif,Georgia,"Times New Roman",serif;text-align:center;padding:2rem}.w{max-width:26rem}h1{font-size:1.9rem;font-weight:600;margin:0 0 .75rem;line-height:1.1}p{color:#2a1f15;line-height:1.6;font-size:1rem;font-family:ui-sans-serif,system-ui,sans-serif;margin:0 0 1.75rem}button{font-family:ui-serif,Georgia,serif;font-size:1.2rem;color:#fff;background:#8b2c1c;border:0;padding:.8rem 2rem;cursor:pointer}button:hover{background:#741f12}</style></head><body><div class="w"><h1>Confirm your sign-in</h1><p>Click below to securely sign in to your dashboard.</p><form method="POST"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">Sign in &rarr;</button></form></div></body></html>`;
}
