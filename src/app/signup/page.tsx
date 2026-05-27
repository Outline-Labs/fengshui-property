import type { Metadata } from "next";

import { SiteMasthead } from "@/components/site-masthead";
import { getCredits } from "@/lib/leads";
import { getLeadId } from "@/lib/session";

import { SignupClient } from "./signup-client";

export const metadata: Metadata = {
  title: "Sign up · Fengshui AI",
  description:
    "Create a free account for unit-level fengshui readings. The more complete your profile, the more free readings you unlock.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const leadId = await getLeadId();

  if (leadId) {
    const { lead } = await getCredits(leadId);
    if (lead) {
      return (
        <>
          <SiteMasthead />
          <SignupClient
            next={next}
            error={error}
            returning
            initial={{
              email: lead.email,
              name: lead.name,
              phone: lead.phone,
              propertyInterest: lead.propertyInterest,
              timeline: lead.timeline,
            }}
          />
        </>
      );
    }
  }

  return (
    <>
      <SiteMasthead />
      <SignupClient next={next} error={error} />
    </>
  );
}
