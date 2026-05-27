import type { Metadata } from "next";

import { LegalSection, LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Data Protection (PDPA) Notice · Fengshui AI",
  description:
    "Our PDPA data protection notice — consent, your rights, withdrawing consent, the Do Not Call registry, and our Data Protection Officer.",
};

export default function PdpaPage() {
  return (
    <LegalShell
      title="Data Protection Notice"
      cn="个人资料保护"
      updated="27 May 2026"
      intro="This notice sets out how Outline Labs complies with Singapore's Personal Data Protection Act (PDPA). It complements our full Privacy Policy."
    >
      <LegalSection n="1" title="Consent">
        <p>
          When you create an account and run readings, you consent to our
          collecting and using your personal data to provide the service. When
          you upload a floor plan, you consent to it being analysed by our
          overseas AI provider (see section 5). When you ask to be matched with
          a specialist and provide your phone number, you consent to us sharing
          your contact details and property interest with a licensed property
          agent.
        </p>
      </LegalSection>

      <LegalSection n="2" title="Data Protection Officer">
        <p>
          Our DPO oversees PDPA compliance and handles your requests and
          complaints. Contact:{" "}
          <a href="mailto:dpo@fengshuiai.sg" className="text-cinnabar hover:underline">
            dpo@fengshuiai.sg
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection n="3" title="Your rights">
        <p>
          You may, at any time, ask us to access or correct the personal data we
          hold about you, or ask how it has been used or disclosed in the past
          year. Email the DPO and we will respond as soon as reasonably
          possible.
        </p>
      </LegalSection>

      <LegalSection n="4" title="Withdrawing consent &amp; Do Not Call">
        <p>
          You may withdraw consent — including withdrawing from specialist
          introductions — by emailing the DPO; we will stop the relevant use
          within a reasonable time. By giving us your phone number and asking to
          be contacted, you consent to a matched agent calling or messaging you
          about your property interest, which overrides your Do Not Call (DNC)
          registration for that purpose only. Withdraw that consent and we, and
          the agent, will stop.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Overseas transfer">
        <p>
          Floor-plan readings are processed by Moonshot AI, which may store and
          process data outside Singapore, including in the People&rsquo;s
          Republic of China. We take reasonable steps so that this processing
          affords protection comparable to the PDPA, and we send only the data
          needed for the reading.
        </p>
      </LegalSection>

      <LegalSection n="6" title="Retention &amp; security">
        <p>
          We keep personal data only as long as needed for the purposes above or
          as required by law; floor-plan images are not retained after a
          reading. We protect data with encryption in transit and access
          controls, and will report any notifiable breach to the PDPC and
          affected individuals as the law requires.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
