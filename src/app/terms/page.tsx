import type { Metadata } from "next";

import { LegalSection, LegalShell } from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service · Fengshui AI",
  description:
    "The terms governing your use of fengshuiai.sg — an AI-assisted fengshui analysis service for informational and educational purposes.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      cn="服务条款"
      updated="5 June 2026"
      intro="These terms govern your use of fengshuiai.sg, operated by Fengshui AI. By using the service you agree to them."
    >
      <LegalSection n="1" title="What we provide">
        <p>
          Fengshui AI gives AI-assisted readings of Singapore properties drawing
          on traditional fengshui — form school, flying stars, and eight
          mansions. Readings are for <strong>informational and educational
          purposes only</strong>.
        </p>
      </LegalSection>

      <LegalSection n="2" title="Not professional advice">
        <p>
          A reading is a cultural and traditional analysis, not a formal
          fengshui audit and not professional advice of any kind — financial,
          investment, legal, medical, or real-estate. The AI interpretation in
          particular is a first-pass aid, offered with a confidence level, and
          may be incomplete or mistaken.
        </p>
        <p>
          Do not make a purchase, sale, renovation, or other significant
          decision in reliance on a reading alone. Consult qualified
          professionals and, for fengshui, a certified master.
        </p>
      </LegalSection>

      <LegalSection n="3" title="Your responsibilities">
        <p>
          You confirm that you own, or have permission to use, any floor plan
          you upload, and that the details you provide are accurate. Don&rsquo;t
          upload others&rsquo; personal data without their consent, don&rsquo;t
          misuse or attempt to disrupt the service, and don&rsquo;t abuse our
          credit or referral features (for example with fake accounts or
          self-referrals).
        </p>
      </LegalSection>

      <LegalSection n="4" title="Readings, credits &amp; payments">
        <p>
          You get a number of free unit-level readings that depends on how
          complete your profile is (currently one to three). You can unlock more
          readings by referring others (section 5) or by buying reading credits.
          Paid credits are processed by our payment provider; prices are shown
          before you pay.
        </p>
        <p>
          Credits are for use within the service only — they have no cash value,
          are not transferable, and may expire. Except where required by law,
          purchases are non-refundable. We may change allowances, pricing,
          features, or availability at any time.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Referral programme">
        <p>
          If you invite others and they sign up and complete a reading, you may
          earn reading credits, subject to limits we set and to these terms. We
          may change, suspend, or end the programme at any time, and we may
          withhold or revoke credits we reasonably believe were obtained through
          fraud, abuse, fake or duplicate accounts, or self-referral.
        </p>
      </LegalSection>

      <LegalSection n="6" title="Payments &amp; third-party services">
        <p>
          Payments are handled by our third-party payment processor under its own
          terms and privacy policy. The service may also rely on, link to, or
          interoperate with other third-party services; those are governed by
          their own terms, and we are not responsible for them. Any dealings
          between you and a third party are solely between you and that party.
        </p>
      </LegalSection>

      <LegalSection n="7" title="Intellectual property">
        <p>
          The site, its design, and the reading engine are owned by Outline
          Labs. Your uploads remain yours. The reading we generate for you is
          provided for your personal use.
        </p>
      </LegalSection>

      <LegalSection n="8" title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, the service is provided
          &ldquo;as is&rdquo;, and Fengshui AI is not liable for any loss or
          damage arising from your use of, or reliance on, a reading, the
          service, or any third-party service.
        </p>
      </LegalSection>

      <LegalSection n="9" title="Governing law &amp; contact">
        <p>
          These terms are governed by the laws of Singapore. Questions:{" "}
          <a href="mailto:hello@fengshuiai.sg" className="text-cinnabar hover:underline">
            hello@fengshuiai.sg
          </a>
          . See also our{" "}
          <a href="/privacy" className="text-cinnabar hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
