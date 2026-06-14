import { redirect } from "next/navigation";

import { getLead, markEmailVerified } from "@/lib/leads";
import { getPostHogClient } from "@/lib/posthog-server";
import { createSession, readLoginToken } from "@/lib/session";
import { consumeToken } from "@/lib/used-tokens";

// force-dynamic so it's never cached. Runs on the consumer host.
export const dynamic = "force-dynamic";

// The GET is IDEMPOTENT — it only validates the token and renders a confirm
// page. It must NOT consume the token or create a session, because email
// security scanners (SafeLinks, Mimecast, antivirus) and browser prefetch issue
// a GET on the link before the human clicks; consuming a single-use token on GET
// would let a bot burn it and break the real sign-in. The POST (a human button
// press, which scanners/prefetchers don't perform) is what consumes the token
// and signs in.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!readLoginToken(token)) redirect("/login?error=link");
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
  const leadId = readLoginToken(token);
  // Single-use: consume on the POST. A replay (or a re-POST of a consumed token)
  // is rejected here; a GET prefetch never reaches this path.
  if (leadId && (await consumeToken(token))) {
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function confirmPage(token: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Sign in · Fengshui AI</title><style>:root{color-scheme:light}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5efe6;color:#1c140e;font-family:ui-serif,Georgia,"Times New Roman",serif;text-align:center;padding:2rem}.w{max-width:26rem}.m{font-size:1.5rem;letter-spacing:-.01em}.d{color:#8b2c1c;margin:0 .15rem}h1{font-size:1.9rem;font-weight:600;margin:1.5rem 0 .75rem;line-height:1.1}p{color:#2a1f15;line-height:1.6;font-size:1rem;font-family:ui-sans-serif,system-ui,sans-serif;margin:0 0 1.75rem}button{font-family:ui-serif,Georgia,serif;font-size:1.2rem;color:#fff;background:#8b2c1c;border:0;padding:.8rem 2rem;cursor:pointer;letter-spacing:.01em}button:hover{background:#741f12}</style></head><body><div class="w"><div class="m">Fengshui<span class="d">·</span>AI</div><h1>Confirm your sign-in</h1><p>Click below to securely sign in to your Fengshui AI account.</p><form method="POST"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">Sign in &rarr;</button></form></div></body></html>`;
}
