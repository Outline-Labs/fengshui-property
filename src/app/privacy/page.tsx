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
      updated="5 June 2026"
      intro="This policy explains what personal data fengshuiai.sg (operated by Fengshui AI) collects, why, who we may share it with, and the choices you have. It is written to comply with Singapore's Personal Data Protection Act (PDPA)."
    >
      <LegalSection n="1" title="What we collect">
        <p>Depending on how you use the service, we may collect:</p>
        <p>
          <strong>Account details</strong> — your email (required), and
          optionally your name, phone or WhatsApp number, the property
          you&rsquo;re interested in, and your buying timeline.
        </p>
        <p>
          <strong>Content you provide</strong> — floor-plan images or PDFs you
          upload, and the addresses or map points you analyse.
        </p>
        <p>
          <strong>Payment information</strong> — if you buy reading credits,
          your payment is handled by our payment processor (Stripe). We receive
          confirmation and limited details of the transaction; we do not collect
          or store your full card number.
        </p>
        <p>
          <strong>Referral information</strong> — if you take part in our
          referral programme, the referral code or link used and the connection
          between the person who referred you and your account, so we can award
          credits.
        </p>
        <p>
          <strong>Usage data</strong> — basic, privacy-respecting analytics
          (pages viewed, readings run) and technical data such as your device
          and approximate location from your IP address. We do not use
          advertising trackers.
        </p>
      </LegalSection>

      <LegalSection n="2" title="How we use it">
        <p>We use your personal data to:</p>
        <p>
          provide, operate, maintain, personalise, and improve the service and
          your readings; manage your account, reading allowance, credits, and
          referrals; process payments; communicate with you about the service,
          your readings, new features, and offers; understand how the service is
          used; protect against fraud, abuse, and security risks; and for any
          other purpose you consent to or that is permitted or required by law.
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
          By uploading a floor plan you consent to this transfer. More generally,
          some of our service providers may store or process data outside
          Singapore. Where we transfer personal data overseas, we take
          reasonable steps so that it receives a standard of protection
          comparable to the PDPA, and we transmit only what is needed. Your floor
          plan is processed in the moment and is not stored on our own servers
          afterwards.
        </p>
      </LegalSection>

      <LegalSection n="4" title="Who we share it with">
        <p>We do not sell your personal data. We may share it with:</p>
        <p>
          <strong>Service providers and partners</strong> — organisations that
          process data on our behalf or help us operate, secure, improve, market,
          and provide the service, such as hosting, payment processing,
          analytics, communications, and AI processing. They may use your data
          only for those purposes.
        </p>
        <p>
          <strong>At your request or with your consent</strong> — third parties
          you ask us to share your information with, or where you have otherwise
          given consent.
        </p>
        <p>
          <strong>Legal and corporate</strong> — where required or permitted by
          law, to enforce our terms, to protect rights, safety, and property, or
          in connection with a merger, acquisition, financing, reorganisation, or
          sale of assets, in which case your data may be among the assets
          transferred.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Retention">
        <p>
          Floor-plan images are not retained after a reading is generated.
          Account details, reading metadata (score, date, facing), and credit and
          referral records are kept while your account is active and for a
          reasonable period afterwards, or as required for legal, accounting, or
          fraud-prevention purposes, then deleted or anonymised. You may request
          earlier deletion at any time.
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
          our collection, use, or disclosure of it. Email{" "}
          <a href="mailto:privacy@fengshuiai.sg" className="text-cinnabar hover:underline">
            privacy@fengshuiai.sg
          </a>{" "}
          and we will respond within a reasonable time. Withdrawing certain
          consents may mean we can no longer provide parts of the service.
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
