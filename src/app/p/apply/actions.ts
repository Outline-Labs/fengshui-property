"use server";

import { redirect } from "next/navigation";

import { applyAgent } from "@/lib/agents";
import { getPostHogClient } from "@/lib/posthog-server";

import { isValidRef } from "./refs";

export async function submitApplication(formData: FormData) {
  const ref = (formData.get("ref")?.toString() ?? "").trim().toLowerCase();

  if (!isValidRef(ref)) {
    redirect("/apply?error=invalid-code");
  }

  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const phone = formData.get("phone")?.toString().trim() ?? "";
  const res = formData.get("res")?.toString().trim().toUpperCase() ?? "";
  const agency = formData.get("agency")?.toString().trim() ?? "";
  const territories = formData.get("territories")?.toString().trim() ?? "";

  if (!name || !email || !phone || !res || !agency) {
    redirect(`/apply?ref=${ref}&error=missing-fields`);
  }

  // An invite code is our vetting gate, so applications through it are approved.
  // RES verification against the CEA directory is a manual follow-up.
  await applyAgent({
    email,
    name,
    agency,
    resNo: res,
    territories,
    referredBy: ref,
    approved: true,
  });

  const ph = getPostHogClient();
  if (ph) {
    ph.capture({
      distinctId: email,
      event: "agent_application_submitted",
      properties: { email, agency, has_territories: !!territories, invite_ref: ref },
    });
    await ph.flush(); // deliver before the action redirects (serverless)
  }

  redirect("/apply?submitted=1");
}
