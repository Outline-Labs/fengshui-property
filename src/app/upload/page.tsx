import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SiteMasthead } from "@/components/site-masthead";
import { safeConsumerHost } from "@/lib/consumer-hosts";
import { REFERRAL_REWARD, getReferralStats } from "@/lib/credits";
import { getCredits } from "@/lib/leads";
import { partnersEnabled } from "@/lib/partners";
import { MAX_QUOTA } from "@/lib/quota";
import { getLeadId } from "@/lib/session";
import { READING_PACKS, revolutConfigured } from "@/lib/revolut";

import { UploadClient } from "./upload-client";

export const metadata: Metadata = {
  title: "Floor plan analysis · Fengshui AI",
  description:
    "Upload your floor plan for a unit-level fengshui reading — form school, flying stars (Period 9), and eight mansions.",
};

// The floor-plan reading server action calls a vision model with a 60s timeout +
// one retry; the page-level maxDuration governs all Server Actions on this route
// so Vercel doesn't kill a slow-but-valid reading at the default (~10–15s) limit.
export const maxDuration = 60;

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ credits?: string; error?: string; verify?: string }>;
}) {
  const { credits, error, verify } = await searchParams;
  const leadId = await getLeadId();
  if (!leadId) redirect("/signup?next=/upload");

  const { lead, remaining, quota, freeQuota, bonusReadings } =
    await getCredits(leadId);
  if (!lead) redirect("/signup?next=/upload");

  const stats = await getReferralStats(leadId);
  const h = await headers();
  const host = safeConsumerHost(h.get("host"));
  const proto = host.includes("localhost") ? "http" : "https";
  const referralUrl = `${proto}://${host}/signup?ref=${stats.code}`;

  return (
    <>
      <SiteMasthead authed />
      <UploadClient
        remaining={remaining}
        quota={quota}
        freeQuota={freeQuota}
        bonusReadings={bonusReadings}
        canUpgrade={freeQuota < MAX_QUOTA}
        referralUrl={referralUrl}
        referralReward={REFERRAL_REWARD}
        referralEarned={stats.earnedReadings}
        referralCount={stats.rewarded}
        packs={[...READING_PACKS]}
        revolutReady={revolutConfigured()}
        creditsBanner={credits}
        errorBanner={error}
        emailVerified={lead.emailVerified === 1}
        verifyBanner={verify}
        specialistEnabled={partnersEnabled()}
        specialistRequested={lead.wantsAgent === 1}
        specialistPhone={lead.phone}
      />
    </>
  );
}
