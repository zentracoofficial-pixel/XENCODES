import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { LegalSection } from "@/components/marketing/legal-section";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <Section>
      <Container>
        <SectionHeading eyebrow="Legal" title="Terms of Service" description="Last updated September 2026." />
        <div className="mx-auto mt-10 max-w-2xl space-y-8">
          <LegalSection title="1. Acceptance of terms">
            <p>
              By creating an account or using Xencodes, you agree to these
              Terms of Service. If you do not agree, do not use the service.
            </p>
          </LegalSection>
          <LegalSection title="2. What Xencodes does">
            <p>
              Xencodes provides virtual phone numbers that can receive SMS
              verification codes for supported third-party services.
              Xencodes relies on third-party number and SMS providers for
              inventory and delivery, and cannot guarantee that every number
              works with every service at all times.
            </p>
          </LegalSection>
          <LegalSection title="3. Eligibility and account responsibility">
            <p>
              You must provide accurate information when creating an
              account and are responsible for activity that occurs under
              your account, including keeping your password and two-factor
              authentication method secure.
            </p>
          </LegalSection>
          <LegalSection title="4. Acceptable use">
            <p>
              Xencodes is for legitimate verification and testing only. Use
              of the service for fraud, impersonation, unauthorized account
              access, or circumventing a platform&apos;s bans or security
              controls is strictly prohibited. See our Acceptable Use
              Policy for details.
            </p>
          </LegalSection>
          <LegalSection title="5. Wallet, pricing, and payment">
            <p>
              Purchases are made using your Xencodes wallet balance. Prices
              vary by service, country, and current availability, and are
              shown before you confirm a purchase. Funds added to your
              wallet are used to pay for activations and are subject to our
              Refund Policy.
            </p>
          </LegalSection>
          <LegalSection title="6. No warranty on third-party compatibility">
            <p>
              Some services may restrict or block virtual numbers under
              their own terms. Xencodes is not responsible for a
              third-party service refusing a number, suspending an account,
              or otherwise enforcing its own policies.
            </p>
          </LegalSection>
          <LegalSection title="7. Limitation of liability">
            <p>
              Xencodes is provided &quot;as is&quot; without warranties of
              any kind. To the maximum extent permitted by law, Xencodes is
              not liable for indirect, incidental, or consequential damages
              arising from use of the service.
            </p>
          </LegalSection>
          <LegalSection title="8. Termination">
            <p>
              We may suspend or terminate accounts that violate these
              terms or our Acceptable Use Policy, with or without notice.
            </p>
          </LegalSection>
          <LegalSection title="9. Changes to these terms">
            <p>
              We may update these terms from time to time. Continued use
              of Xencodes after a change constitutes acceptance of the
              updated terms.
            </p>
          </LegalSection>
          <LegalSection title="10. Contact">
            <p>
              Questions about these terms can be sent through our{" "}
              <a href="/support" className="text-forest hover:underline">
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
