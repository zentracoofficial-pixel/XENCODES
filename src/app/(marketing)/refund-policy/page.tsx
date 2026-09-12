import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { LegalSection } from "@/components/marketing/legal-section";

export const metadata: Metadata = {
  title: "Refund Policy",
};

export default function RefundPolicyPage() {
  return (
    <Section>
      <Container>
        <SectionHeading eyebrow="Legal" title="Refund Policy" description="Last updated September 2026." />
        <div className="mx-auto mt-10 max-w-2xl space-y-8">
          <LegalSection title="No code, no charge">
            <p>
              If your purchased number does not receive a valid verification
              code within its session period, you can cancel the
              activation and the full amount is refunded to your Xencodes
              wallet automatically.
            </p>
          </LegalSection>
          <LegalSection title="Automatic expiry">
            <p>
              If a session period ends without a code arriving and you
              haven&apos;t manually cancelled, the activation expires and is
              refunded automatically the next time its status is checked.
            </p>
          </LegalSection>
          <LegalSection title="What is not eligible for a refund">
            <p>
              A number that successfully receives a valid verification code
              has fulfilled its purpose and is not eligible for a refund,
              even if you did not complete the verification on the
              third-party service in time.
            </p>
            <p>
              If a service refuses to accept a virtual number under its own
              policies after a code has already been delivered, this is not
              eligible for a refund, since the number itself functioned
              correctly.
            </p>
          </LegalSection>
          <LegalSection title="Refund destination">
            <p>
              Refunds are credited to your Xencodes wallet balance, not to
              your original payment method, and can be used for future
              purchases.
            </p>
          </LegalSection>
          <LegalSection title="Questions about a specific activation">
            <p>
              If you believe an activation was charged incorrectly, contact{" "}
              <a href="/support" className="text-primary hover:underline">
                Support
              </a>{" "}
              with the phone number or approximate purchase time.
            </p>
          </LegalSection>
        </div>
      </Container>
    </Section>
  );
}
