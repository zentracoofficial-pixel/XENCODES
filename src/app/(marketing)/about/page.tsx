import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Xencodes",
  description:
    "Xencodes is a virtual SMS verification platform: virtual phone numbers for receiving SMS verification codes across supported online services. Here's what that means and how it works.",
  alternates: { canonical: "/about" },
};

const SECTIONS = [
  { id: "the-problem-it-solves", label: "The problem it solves" },
  { id: "how-the-platform-works", label: "How the platform works" },
  { id: "virtual-numbers-and-sms-verification-plainly", label: "Virtual numbers and SMS verification, plainly" },
  { id: "supported-services-and-countries", label: "Supported services and countries" },
  { id: "wallet-and-payment-model", label: "Wallet and payment model" },
  { id: "no-code-and-refund-policy", label: "No-code and refund policy" },
  { id: "contact", label: "Contact" },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "@id": `${SITE_URL}/about/#page`,
          url: `${SITE_URL}/about`,
          about: { "@id": `${SITE_URL}/#organization` },
        }}
      />

      <PageHero
        crumbs={[{ label: "About" }]}
        eyebrow="About Xencodes"
        title="What is Xencodes?"
        description={
          <p>
            Xencodes is a virtual SMS verification platform. It provides
          virtual phone numbers for receiving SMS verification codes across
          supported online services: the one-time codes services like
          WhatsApp, Telegram or a marketplace account send to confirm a phone
          number belongs to you.
          </p>
        }
      />

      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">On this page</p>
              <ul className="mt-3 space-y-1 border-l border-border">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="-ml-px block border-l border-transparent py-1 pl-3 text-sm text-muted-foreground transition-colors hover:border-forest hover:text-foreground"
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="max-w-2xl">

            <Section id="the-problem-it-solves" className="mt-10 scroll-mt-24 py-0 first:mt-0">
              <SectionHeading as="h2" title="The problem it solves" />
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  Many services require a phone number before you can create an
                  account, and will text a one-time code to that number to prove
                  it&apos;s real. Handing over a personal number for every
                  account you open isn&apos;t always what you want. You might
                  be testing a service, managing several accounts for work, or
                  simply not want a marketplace or app holding your real number.
                </p>
                <p>
                  A virtual number from Xencodes exists for exactly that moment:
                  you use it to receive the one verification code the service
                  sends, and then you&apos;re done. It is not a phone line for
                  ongoing calls or texts.
                </p>
              </div>
            </Section>

            <Section id="how-the-platform-works" className="mt-10 scroll-mt-24 py-0 first:mt-0">
              <SectionHeading as="h2" title="How the platform works" />
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  You choose the service you want to verify an account for, then
                  choose a country. Xencodes shows the live price and whether a
                  number is currently in stock for that exact combination.
                  Availability changes constantly as numbers are used, so what
                  you see is checked in real time, not a fixed list.
                </p>
                <p>
                  Buying a number takes a payment from your Xencodes wallet
                  balance, immediately assigns you that number, and opens an
                  activation session. You enter the number on the third-party
                  service, and the moment that service sends its verification
                  code, it appears on your Xencodes activation page. See{" "}
                  <Link href="/how-it-works" className="text-forest underline-offset-4 hover:underline">
                    how it works
                  </Link>{" "}
                  for the full walkthrough.
                </p>
              </div>
            </Section>

            <Section id="virtual-numbers-and-sms-verification-plainly" className="mt-10 scroll-mt-24 py-0 first:mt-0">
              <SectionHeading as="h2" title="Virtual numbers and SMS verification, plainly" />
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  A <strong>virtual number</strong> is a real, working phone
                  number that isn&apos;t tied to a physical SIM card in your own
                  phone. It exists to receive messages through a platform like
                  Xencodes instead. <strong>SMS verification</strong> is the
                  standard security step many services use: they text a short
                  code to a number, and you type that code back into the service
                  to prove you control it.
                </p>
                <p>
                  Xencodes sits between those two things: it gives you a virtual
                  number for the specific service and country you need, for as
                  long as one verification takes.
                </p>
              </div>
            </Section>

            <Section id="supported-services-and-countries" className="mt-10 scroll-mt-24 py-0 first:mt-0">
              <SectionHeading as="h2" title="Supported services and countries" />
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  Xencodes supports a large, live catalog of services,
                  including widely used platforms like WhatsApp, Telegram,
                  Facebook, Instagram, TikTok, Discord and many marketplace and
                  freelance sites, across multiple countries. Because
                  availability changes with stock, the exact list of what you
                  can buy right now is always the{" "}
                  <Link href="/services" className="text-forest underline-offset-4 hover:underline">
                    live Services page
                  </Link>
                  , not a fixed catalog printed here.
                </p>
              </div>
            </Section>

            <Section id="wallet-and-payment-model" className="mt-10 scroll-mt-24 py-0 first:mt-0">
              <SectionHeading as="h2" title="Wallet and payment model" />
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  Xencodes uses a pay-as-you-go wallet: you add funds once, then
                  spend them a number at a time with no subscription and no
                  minimum commitment. Funding is currently supported in Nigerian
                  Naira (NGN) through KoraPay, by card, bank transfer or USSD.
                  See{" "}
                  <Link href="/pricing" className="text-forest underline-offset-4 hover:underline">
                    how pricing works
                  </Link>{" "}
                  for what actually sets a number&apos;s price.
                </p>
              </div>
            </Section>

            <Section id="no-code-and-refund-policy" className="mt-10 scroll-mt-24 py-0 first:mt-0">
              <SectionHeading as="h2" title="No-code and refund policy" />
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  If a purchased number does not receive a valid verification
                  code within its session, the full amount is refunded to your
                  Xencodes wallet automatically. You can also cancel earlier
                  yourself for the same result. A number that does successfully
                  receive a code has done its job and is not eligible for a
                  refund. The full details are on the{" "}
                  <Link href="/refund-policy" className="text-forest underline-offset-4 hover:underline">
                    Refund Policy
                  </Link>{" "}
                  page.
                </p>
              </div>
            </Section>

            <Section id="contact" className="mt-10 scroll-mt-24 py-0">
              <SectionHeading as="h2" title="Contact" />
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  Questions about an order, a payment, or the platform itself
                  can be sent to{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-forest underline-offset-4 hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                  , or raised as a support ticket from your dashboard once
                  you&apos;re signed in.
                </p>
              </div>
            </Section>


            <CtaBand
              title="Ready to try it?"
              body="Search for your service and see live prices before you buy."
            />
          </div>
        </div>
      </Container>
    </>
  );
}
