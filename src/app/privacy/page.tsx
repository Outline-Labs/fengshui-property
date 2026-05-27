import type { Metadata } from "next";

import { LegalSection, LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy · Fengshui AI",
  description:
    "How Fengshui AI collects, uses, shares, and protects your personal data, in line with Singapore's PDPA.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      cn="隐私政策"
      updated="27 May 2026"
      intro="This policy explains what personal data fengshuiai.sg (operated by Fengshui AI) collects, why, who we share it with, and the choices you have. It is written to comply with Singapore's Personal Data Protection Act (PDPA)."
    >
      <LegalSection n="1" title="What we collect">
        <p>Depending on how you use the service, we may collect:</p>
        <p>
          <strong>Account details</strong> — your email (required), and
          optionally your name, phone or WhatsApp number, the property
          you&rsquo;re interested in, and your buying timeline.
        </p>
        <p>
          <strong>Floor plans</strong> — images or PDFs you upload for a
          unit-level reading.
        </p>
        <p>
          <strong>Property locations</strong> — the addresses and map points
          you analyse.
        </p>
        <p>
          <strong>Usage data</strong> — basic, privacy-respecting analytics
          (pages viewed, readings run). We do not use advertising trackers.
        </p>
      </LegalSection>

      <LegalSection n="2" title="How we use it">
        <p>
          To generate your fengshui readings; to operate your free account and
          reading allowance; to improve the service; and — only if you ask for
          it — to introduce you to a property specialist (see section 4).
        </p>
      </LegalSection>

      <LegalSection n="3" title="AI processing &amp; cross-border transfer">
        <p>
          Unit-level readings are produced with an AI vision model provided by
          Moonshot AI (&ldquo;Kimi&rdquo;). When you request a reading, the
          floor-plan image and the facing direction are sent to Moonshot&rsquo;s
          API for analysis. Moonshot is headquartered in the People&rsquo;s
          Republic of China and its servers may be located outside Singapore.
        </p>
        <p>
          By uploading a floor plan you consent to this transfer. We take
          reasonable steps so that overseas processing affords a standard of
          protection comparable to the PDPA, and we transmit only what is needed
          for the reading. Your floor plan is processed in the moment and is not
          stored on our own servers afterwards.
        </p>
      </LegalSection>

      <LegalSection n="4" title="Sharing with property specialists">
        <p>
          Fengshui AI is free because we may connect interested buyers with
          licensed property agents. If you provide your phone number and ask to
          be matched with a specialist, we share your name, contact details, and
          the property you&rsquo;re considering with a vetted, CEA-registered
          agent in that area. We do not share your data with agents unless you
          take that step. You can decline or withdraw at any time (section 7).
        </p>
      </LegalSection>

      <LegalSection n="5" title="Retention">
        <p>
          Floor-plan images are not retained after a reading is generated.
          Account details and the metadata of your readings (score, date,
          facing) are kept while your account is active and for a reasonable
          period afterwards, then deleted or anonymised. You may request earlier
          deletion at any time.
        </p>
      </LegalSection>

      <LegalSection n="6" title="Cookies">
        <p>
          We set a single signed session cookie to keep you logged in. We use
          only privacy-respecting, aggregate analytics — no third-party
          advertising cookies.
        </p>
      </LegalSection>

      <LegalSection n="7" title="Your rights">
        <p>
          Under the PDPA you may request access to, or correction of, the
          personal data we hold about you, and you may withdraw your consent to
          our collection, use, or disclosure of it (including withdrawing from
          agent introductions). Email{" "}
          <a href="mailto:privacy@fengshuiai.sg" className="text-cinnabar hover:underline">
            privacy@fengshuiai.sg
          </a>{" "}
          and we will respond within a reasonable time.
        </p>
      </LegalSection>

      <LegalSection n="8" title="Security">
        <p>
          We protect your data with encryption in transit, access controls, and
          a hosting region appropriate for Singapore data. No system is
          perfectly secure, but we work to minimise risk and will notify you and
          the PDPC of any notifiable data breach as required by law.
        </p>
      </LegalSection>

      <LegalSection n="9" title="Changes &amp; contact">
        <p>
          We may update this policy; material changes will be reflected by the
          date above. Our Data Protection Officer can be reached at{" "}
          <a href="mailto:dpo@fengshuiai.sg" className="text-cinnabar hover:underline">
            dpo@fengshuiai.sg
          </a>
          . For PDPA-specific matters, see our{" "}
          <a href="/pdpa" className="text-cinnabar hover:underline">
            Data Protection Notice
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
