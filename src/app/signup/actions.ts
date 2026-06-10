"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { sendMagicLink } from "@/lib/auth-email";
import { attachReferral } from "@/lib/credits";
import { getLeadByEmail, upsertLead } from "@/lib/leads";
import { getPostHogClient } from "@/lib/posthog-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession, getLeadId } from "@/lib/session";

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") ? next : "/upload";
}

export async function signup(formData: FormData) {
  const email = (formData.get("email")?.toString() ?? "").trim();
  const next = formData.get("next")?.toString();
  const ref = formData.get("ref")?.toString();

  // Per-IP throttle: signup is email-only (no verification), so cap submissions
  // to curb throwaway-account / lead spam. Plan-independent (works on Hobby,
  // where Vercel Firewall rate limiting isn't available).
  const h = await headers();
  const rl = await rateLimit({
    key: `signup:${clientIp(h)}`,
    limit: 10,
    windowMs: 600_000,
  });
  if (!rl.ok) {
    const q = new URLSearchParams({ error: "ratelimited" });
    if (next) q.set("next", next);
    if (ref) q.set("ref", ref);
    redirect(`/signup?${q.toString()}`);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const q = new URLSearchParams({ error: "email" });
    if (next) q.set("next", next);
    if (ref) q.set("ref", ref);
    redirect(`/signup?${q.toString()}`);
  }

  // If an account already exists for this email, only the OWNER — a session
  // bound to that same lead (the returning profile-edit flow) — may proceed.
  // Anyone else is a takeover attempt: never mint a session or mutate the lead
  // from an unauthenticated form (impersonate the owner, read/overwrite their
  // profile, spend their credits). Email the real owner a login link and stop,
  // without touching their data. (The per-IP throttle also covers enumeration.)
  const existing = await getLeadByEmail(email);
  const sessionLeadId = await getLeadId();
  const ownerEdit = existing != null && sessionLeadId === existing.id;
  if (existing && !ownerEdit) {
    try {
      await sendMagicLink({
        email,
        leadId: existing.id,
        hostHeader: h.get("host"),
        kind: "login",
      });
    } catch {
      // they can retry from /login
    }
    redirect("/login?sent=1");
  }

  // First + last name are mandatory for a NEW signup; for an owner editing their
  // own profile we require only a first name, so legacy single-token names (pre-
  // split signups, /map leads with no name) can still save. Enforced server-side
  // (the form's `required` can be bypassed).
  const firstName = (formData.get("firstName")?.toString() ?? "").trim();
  const lastName = (formData.get("lastName")?.toString() ?? "").trim();
  if (!firstName || (!ownerEdit && !lastName)) {
    const q = new URLSearchParams({ error: "name" });
    if (next) q.set("next", next);
    if (ref) q.set("ref", ref);
    redirect(`/signup?${q.toString()}`);
  }
  const name = `${firstName} ${lastName}`.trim();

  const phone = formData.get("phone")?.toString();
  const propertyInterest = formData.get("propertyInterest")?.toString();
  const timeline = formData.get("timeline")?.toString();

  const id = await upsertLead({ email, name, phone, propertyInterest, timeline });

  // Credit the referee's signup bonus and record their referrer. No-ops on a
  // self / unknown / already-referred code, so it's safe on every submit.
  if (ref) await attachReferral(id, ref);

  await createSession(id);

  // Email-verification magic link (best-effort — never block signup on a
  // transient email failure; they can resend from /upload or /login). Skip it
  // for an owner who already verified, so a profile edit doesn't re-send it.
  if (!existing?.emailVerified) {
    try {
      await sendMagicLink({
        email,
        leadId: id,
        hostHeader: h.get("host"),
        kind: "verify",
      });
    } catch {
      // verification can be resent later
    }
  }

  const ph = getPostHogClient();
  if (ph) {
    ph.identify({ distinctId: id, properties: { email, name, phone } });
    ph.capture({
      distinctId: id,
      event: "signup_completed",
      properties: {
        email,
        has_name: !!name,
        has_phone: !!phone,
        has_property_interest: !!propertyInterest,
        has_timeline: !!timeline,
        referred: !!ref,
      },
    });
    await ph.flush(); // deliver before the action redirects (serverless)
  }

  redirect(safeNext(next));
}
