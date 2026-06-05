import type { Metadata } from "next";

import { SiteMasthead } from "@/components/site-masthead";
import { referralCodeExists } from "@/lib/credits";
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
  searchParams: Promise<{ next?: string; error?: string; ref?: string }>;
}) {
  const { next, error, ref } = await searchParams;
  const leadId = await getLeadId();

  // Only honour a referral code that maps to a real referrer — otherwise we
  // neither show the invite banner nor carry the (bogus) code into the form.
  const validRef = ref ? await referralCodeExists(ref) : false;
  const refCode = validRef ? ref : undefined;

  if (leadId) {
    const { lead } = await getCredits(leadId);
    if (lead) {
      return (
        <>
          <SiteMasthead />
          <SignupClient
            next={next}
            error={error}
            refCode={refCode}
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
      <SignupClient next={next} error={error} refCode={refCode} />
    </>
  );
}
