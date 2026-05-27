import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SiteMasthead } from "@/components/site-masthead";
import { getCredits } from "@/lib/leads";
import { MAX_QUOTA } from "@/lib/quota";
import { getLeadId } from "@/lib/session";

import { UploadClient } from "./upload-client";

export const metadata: Metadata = {
  title: "Floor plan analysis · Fengshui AI",
  description:
    "Upload your floor plan for a unit-level fengshui reading — form school, flying stars (Period 9), and eight mansions.",
};

export default async function UploadPage() {
  const leadId = await getLeadId();
  if (!leadId) redirect("/signup?next=/upload");

  const { lead, remaining, quota } = await getCredits(leadId);
  if (!lead) redirect("/signup?next=/upload");

  return (
    <>
      <SiteMasthead />
      <UploadClient
        remaining={remaining}
        quota={quota}
        canUpgrade={quota < MAX_QUOTA}
        specialistRequested={lead.wantsAgent === 1}
        specialistPhone={lead.phone}
      />
    </>
  );
}
