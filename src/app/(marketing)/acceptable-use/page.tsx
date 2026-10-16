import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { LegalSection } from "@/components/marketing/legal-section";
import { PageHero } from "@/components/marketing/page-hero";
import { SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Acceptable Use and What We Promise",
  description:
    "What Xencodes virtual numbers may and may not be used for, what we do and do not promise about SMS codes, and how to tell the real Xencodes site from a copy.",
  alternates: { canonical: "/acceptable-use" },
};

export default function AcceptableUsePage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: "Acceptable use" }]}
        eyebrow="Legal"
        title="Acceptable use and what we promise"
        description="Plain rules for using a Xencodes number, and plain limits on what we can promise."
      />
      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)] sm:p-10">
          <LegalSection title="What a Xencodes number is for">
            <p>
              A Xencodes number receives the one-time SMS code that a website or
              app sends to confirm a phone number. Legitimate uses include
              keeping your personal number private, separating a work or
              business account from a personal one, verifying an account while
              you are abroad, and testing sign-up flows you build or maintain.
            </p>
          </LegalSection>
          <LegalSection title="What it must not be used for">
            <ul className="list-disc space-y-1 pl-5">
              <li>Fraud, scams, phishing or impersonating another person or business.</li>
              <li>Taking over, or gaining access to, an account that is not yours.</li>
              <li>Harassment, threats or any unlawful activity.</li>
              <li>Breaking a service&apos;s own terms of use, including creating accounts the service has told you that you may not have.</li>
              <li>Getting around a ban or a security control that a service has placed on you.</li>
            </ul>
            <p>
              Services that are restricted in many places, such as gambling,
              betting, tobacco, alcohol and adult services, are not offered.
              We may close an account and withhold a refund where these rules
              are broken, as set out in the{" "}
              <Link href="/terms" className="text-forest underline-offset-4 hover:underline">
                Terms
              </Link>
              .
            </p>
          </LegalSection>
          <LegalSection title="What we promise">
            <ul className="list-disc space-y-1 pl-5">
              <li>The price is shown before you buy, and you are charged only that price.</li>
              <li>If no code arrives in the session, the number is cancelled and the full price goes back to the same wallet automatically.</li>
              <li>Your balance stays in the currency you funded it in.</li>
            </ul>
          </LegalSection>
          <LegalSection title="What we cannot promise">
            <ul className="list-disc space-y-1 pl-5">
              <li>That a code will arrive. Delivery depends on the service sending it and on the mobile networks in between.</li>
              <li>That any service will accept a virtual number. Some services reject them, and that is the service&apos;s decision.</li>
              <li>That a number is exclusive for ever. It is yours for the session you paid for, then it is released.</li>
              <li>A fixed price. Prices follow supply and change; the price on the page when you buy is the one that applies.</li>
            </ul>
            <p>
              Numbers are supplied by third-party suppliers, shown to you as
              Server I and Server II. A number that has already received its
              code is not refundable; see the{" "}
              <Link href="/refund-policy" className="text-forest underline-offset-4 hover:underline">
                Refund policy
              </Link>
              .
            </p>
          </LegalSection>
          <LegalSection title="The official Xencodes site">
            <p>
              The only official Xencodes website is{" "}
              <a href={SITE_URL} className="text-forest underline-offset-4 hover:underline">
                {SITE_URL.replace("https://", "")}
              </a>
              . We will never ask for your password, and support replies
              come from {SUPPORT_EMAIL} or from your dashboard. If another
              site uses our name, do not fund a wallet there.
            </p>
          </LegalSection>
        </div>
      </Container>
    </>
  );
}
