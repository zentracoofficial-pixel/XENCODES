import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { LegalSection } from "@/components/marketing/legal-section";
import { PageHero } from "@/components/marketing/page-hero";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "When a Xencodes purchase is refunded automatically, when you can cancel for a refund yourself, and how wallet refunds work.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <>
      <PageHero crumbs={[{ label: "Refund Policy" }]} eyebrow="Legal" title="Refund Policy" description="Last updated September 2026." />
      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)] sm:p-10">
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
              <Link href="/dashboard/support" className="inline-block -my-2.5 py-2.5 text-forest hover:underline">
                Support
              </Link>{" "}
              with the phone number or approximate purchase time.
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
