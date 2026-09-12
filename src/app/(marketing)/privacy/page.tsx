import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { LegalSection } from "@/components/marketing/legal-section";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <Section>
      <Container>
        <SectionHeading eyebrow="Legal" title="Privacy Policy" description="Last updated September 2026." />
        <div className="mx-auto mt-10 max-w-2xl space-y-8">
          <LegalSection title="1. Information we collect">
            <p>
              We collect the information you provide when creating an
              account (such as your email address), records of the
              activations and wallet transactions you make, and basic
              technical information such as IP address and browser type for
              security and fraud prevention.
            </p>
          </LegalSection>
          <LegalSection title="2. How we use your information">
            <p>
              We use this information to operate your account, process
              purchases, deliver verification codes, prevent fraud and
              abuse, and communicate with you about your account.
            </p>
          </LegalSection>
          <LegalSection title="3. Third-party providers">
            <p>
              Xencodes uses third-party providers for number inventory, SMS
              delivery, and email delivery. These providers process the
              minimum information necessary to perform their function, such
              as the phone number assigned to your activation.
            </p>
          </LegalSection>
          <LegalSection title="4. Data retention">
            <p>
              We retain account and activation records for as long as your
              account is active and as needed to comply with legal
              obligations, resolve disputes, and enforce our agreements.
            </p>
          </LegalSection>
          <LegalSection title="5. Your rights">
            <p>
              You may request access to, correction of, or deletion of your
              personal information by contacting us through our Support
              page, subject to legal and operational limitations.
            </p>
          </LegalSection>
          <LegalSection title="6. Cookies">
            <p>
              We use essential cookies to keep you signed in and remember
              your interface preferences. We do not use cookies for
              third-party advertising.
            </p>
          </LegalSection>
          <LegalSection title="7. Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes
              will be reflected by updating the date at the top of this
              page.
            </p>
          </LegalSection>
          <LegalSection title="8. Contact">
            <p>
              Questions about this policy can be sent through our{" "}
              <a href="/support" className="inline-block -my-2.5 py-2.5 text-forest hover:underline">
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
