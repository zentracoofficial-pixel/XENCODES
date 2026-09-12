import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { LegalSection } from "@/components/marketing/legal-section";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
};

export default function AcceptableUsePage() {
  return (
    <Section>
      <Container>
        <SectionHeading eyebrow="Legal" title="Acceptable Use Policy" description="Last updated September 2026." />
        <div className="mx-auto mt-10 max-w-2xl space-y-8">
          <LegalSection title="Intended use">
            <p>
              Xencodes is built strictly for legitimate account verification
              and testing. It must not be used for fraud, impersonation,
              unauthorized access to accounts that are not your own, or to
              circumvent a platform&apos;s bans, security controls, or
              restrictions.
            </p>
          </LegalSection>
          <LegalSection title="Prohibited activities">
            <p>Using Xencodes for any of the following is strictly prohibited:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Fraud, scams, or financial crimes</li>
              <li>Impersonating another person or organization</li>
              <li>Accessing accounts you are not authorized to access</li>
              <li>Bypassing a platform&apos;s bans, suspensions, or security controls</li>
              <li>Any activity that violates applicable law</li>
              <li>Spamming or abusive messaging</li>
              <li>Reselling Xencodes numbers without authorization</li>
            </ul>
          </LegalSection>
          <LegalSection title="Third-party terms">
            <p>
              Some services do not permit virtual numbers under their own
              terms of service. You are responsible for confirming a
              service&apos;s own policies before using a Xencodes number
              with it.
            </p>
          </LegalSection>
          <LegalSection title="Enforcement">
            <p>
              We monitor for abuse and may suspend or terminate accounts
              that violate this policy, with or without notice, and without
              refund for activity found to violate this policy.
            </p>
          </LegalSection>
          <LegalSection title="Reporting abuse">
            <p>
              If you believe Xencodes is being used to violate this policy,
              contact us through our{" "}
              <a href="/support" className="text-primary hover:underline">
                Support
              </a>{" "}
              page.
            </p>
          </LegalSection>
        </div>
      </Container>
    </Section>
  );
}
