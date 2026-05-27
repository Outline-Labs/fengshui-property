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
      updated="27 May 2026"
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
          upload others&rsquo; personal data without their consent, and
          don&rsquo;t misuse or attempt to disrupt the service.
        </p>
      </LegalSection>

      <LegalSection n="4" title="Free service &amp; allowances">
        <p>
          The service is free. The number of free unit-level readings depends on
          how complete your profile is (currently one to three). We may change
          allowances, features, or availability at any time.
        </p>
      </LegalSection>

      <LegalSection n="5" title="Specialist introductions">
        <p>
          If you opt in, we may introduce you to a licensed property agent. Any
          dealings, agreements, or transactions between you and that agent are
          solely between the two of you; Fengshui AI is not a party to them and
          is not an estate agency.
        </p>
      </LegalSection>

      <LegalSection n="6" title="Intellectual property">
        <p>
          The site, its design, and the reading engine are owned by Outline
          Labs. Your uploads remain yours. The reading we generate for you is
          provided for your personal use.
        </p>
      </LegalSection>

      <LegalSection n="7" title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, the service is provided
          &ldquo;as is&rdquo;, and Fengshui AI is not liable for any loss or
          damage arising from your use of, or reliance on, a reading or a
          specialist introduction.
        </p>
      </LegalSection>

      <LegalSection n="8" title="Governing law &amp; contact">
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
