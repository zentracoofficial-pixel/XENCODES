import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { LegalSection } from "@/components/marketing/legal-section";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Xencodes collects when you create an account, buy a number, or fund your wallet, and how that information is used and kept.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <PageHero crumbs={[{ label: "Privacy Policy" }]} eyebrow="Legal" title="Privacy Policy" description="Last updated September 2026." />
      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)] sm:p-10">
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
              <Link href="/dashboard/support" className="inline-block -my-2.5 py-2.5 text-forest hover:underline">
                Support
              </Link>{" "}
              page.
            </p>
          </LegalSection>
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-sm text-muted-foreground">
          Questions? See the{" "}
          <Link href="/faq" className="text-forest underline-offset-4 hover:underline">
            FAQ
          </Link>{" "}
          or{" "}
          <Link href="/about#contact" className="text-forest underline-offset-4 hover:underline">
            contact us
          </Link>
          .
        </p>
      </Container>
    </>
  );
}
