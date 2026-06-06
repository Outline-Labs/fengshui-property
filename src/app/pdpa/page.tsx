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
      updated="5 June 2026"
      intro="This notice sets out how Fengshui AI complies with Singapore's Personal Data Protection Act (PDPA). It complements our full Privacy Policy."
    >
      <LegalSection n="1" title="Consent">
        <p>
          When you create an account and use the service, you consent to our
          collecting, using, and disclosing your personal data for the purposes
          described in our{" "}
          <a href="/privacy" className="text-cinnabar hover:underline">
            Privacy Policy
          </a>
          . When you upload a floor plan, you consent to it being analysed by our
          overseas AI provider (see section 5). Where the law allows, we may also
          collect, use, or disclose personal data without consent — for example
          for purposes deemed consented to, or as otherwise permitted under the
          PDPA. You may give, or decline to give, separate consent for specific
          uses or disclosures.
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
          You may withdraw any consent you have given by emailing the DPO; we
          will stop the relevant collection, use, or disclosure within a
          reasonable time, though this may mean we can no longer provide parts of
          the service. Where you provide a phone number and ask us to contact you
          about your request, you consent to us calling or messaging you for that
          purpose, which overrides your Do Not Call (DNC) registration for that
          purpose only. Withdraw that consent and we will stop.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Overseas transfer">
        <p>
          Floor-plan readings are processed by Moonshot AI, which may store and
          process data outside Singapore, including in the People&rsquo;s
          Republic of China. Some of our other service providers may also process
          data overseas. We take reasonable steps so that such processing affords
          protection comparable to the PDPA, and we send only the data needed.
        </p>
      </LegalSection>

      <LegalSection n="6" title="Retention &amp; security">
        <p>
          We keep personal data only as long as needed for the purposes set out
          in our Privacy Policy or as required by law; floor-plan images are not
          retained after a reading. We protect data with encryption in transit
          and access controls, and will report any notifiable breach to the PDPC
          and affected individuals as the law requires.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
