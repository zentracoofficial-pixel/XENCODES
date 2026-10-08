import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Xencodes",
  description:
    "Xencodes is a virtual SMS verification platform: virtual phone numbers for receiving SMS verification codes across supported online services. Here's what that means and how it works.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <Container className="py-10 sm:py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "@id": `${SITE_URL}/about/#page`,
          url: `${SITE_URL}/about`,
          about: { "@id": `${SITE_URL}/#organization` },
        }}
      />

      <Breadcrumbs items={[{ label: "About" }]} />

      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What is Xencodes?
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
          Xencodes is a virtual SMS verification platform. It provides
          virtual phone numbers for receiving SMS verification codes across
          supported online services — the one-time codes services like
          WhatsApp, Telegram or a marketplace account send to confirm a phone
          number belongs to you.
        </p>

        <Section className="mt-10 py-0">
          <SectionHeading as="h2" title="The problem it solves" />
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              Many services require a phone number before you can create an
              account, and will text a one-time code to that number to prove
              it&apos;s real. Handing over a personal number for every
              account you open isn&apos;t always what you want — you might
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

        <Section className="mt-10 py-0">
          <SectionHeading as="h2" title="How the platform works" />
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              You choose the service you want to verify an account for, then
              choose a country. Xencodes shows the live price and whether a
              number is currently in stock for that exact combination —
              availability changes constantly as numbers are used, so what
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

        <Section className="mt-10 py-0">
          <SectionHeading as="h2" title="Virtual numbers and SMS verification, plainly" />
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              A <strong>virtual number</strong> is a real, working phone
              number that isn&apos;t tied to a physical SIM card in your own
              phone — it exists to receive messages through a platform like
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

        <Section className="mt-10 py-0">
          <SectionHeading as="h2" title="Supported services and countries" />
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              Xencodes supports a large, live catalog of services —
              including widely used platforms like WhatsApp, Telegram,
              Facebook, Instagram, TikTok, Discord and many marketplace and
              freelance sites — across multiple countries. Because
              availability changes with stock, the exact list of what you
              can buy right now is always the{" "}
              <Link href="/services" className="text-forest underline-offset-4 hover:underline">
                live Services page
              </Link>
              , not a fixed catalog printed here.
            </p>
          </div>
        </Section>

        <Section className="mt-10 py-0">
          <SectionHeading as="h2" title="Wallet and payment model" />
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              Xencodes uses a pay-as-you-go wallet: you add funds once, then
              spend them a number at a time with no subscription and no
              minimum commitment. Funding is currently supported in Nigerian
              Naira (NGN) through KoraPay — by card, bank transfer or USSD.
              See{" "}
              <Link href="/pricing" className="text-forest underline-offset-4 hover:underline">
                how pricing works
              </Link>{" "}
              for what actually sets a number&apos;s price.
            </p>
          </div>
        </Section>

        <Section className="mt-10 py-0">
          <SectionHeading as="h2" title="No-code and refund policy" />
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              If a purchased number does not receive a valid verification
              code within its session, the full amount is refunded to your
              Xencodes wallet automatically — you can also cancel earlier
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

        <div className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl bg-forest px-6 py-6">
          <div className="flex-1">
            <p className="text-base font-semibold text-white">Ready to try it?</p>
            <p className="mt-1 text-sm text-white/70">
              Search for your service and get a number in seconds.
            </p>
          </div>
          <Button href="/buy" variant="accent">
            Get a Number
          </Button>
        </div>
      </div>
    </Container>
  );
}
