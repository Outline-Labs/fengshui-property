"use server";

import { redirect } from "next/navigation";

import { attachReferral } from "@/lib/credits";
import { upsertLead } from "@/lib/leads";
import { createSession } from "@/lib/session";

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") ? next : "/upload";
}

export async function signup(formData: FormData) {
  const email = (formData.get("email")?.toString() ?? "").trim();
  const next = formData.get("next")?.toString();
  const ref = formData.get("ref")?.toString();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const q = new URLSearchParams({ error: "email" });
    if (next) q.set("next", next);
    if (ref) q.set("ref", ref);
    redirect(`/signup?${q.toString()}`);
  }

  const id = await upsertLead({
    email,
    name: formData.get("name")?.toString(),
    phone: formData.get("phone")?.toString(),
    propertyInterest: formData.get("propertyInterest")?.toString(),
    timeline: formData.get("timeline")?.toString(),
  });

  // Credit the referee's signup bonus and record their referrer. No-ops on a
  // self / unknown / already-referred code, so it's safe on every submit.
  if (ref) await attachReferral(id, ref);

  await createSession(id);
  redirect(safeNext(next));
}
