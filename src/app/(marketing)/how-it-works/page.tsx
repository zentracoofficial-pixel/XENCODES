import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { ArrowRight, RotateCcw } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "How to get a virtual number from Xencodes and receive your SMS verification code: create an account, fund your wallet, choose a service and country, and receive your code in real time.",
  alternates: { canonical: "/how-it-works" },
};

const STEPS = [
  {
    title: "Create an account",
    body: "Sign up with your email. Your account holds your wallet balance and your activation history.",
  },
  {
    title: "Fund your wallet",
    body: "Add funds in NGN through KoraPay by card, bank transfer or USSD. Nothing is spent until you buy a number.",
  },
  {
    title: "Choose a service",
    body: "Search for the platform you need to verify: WhatsApp, Telegram, a marketplace account, or any other supported service.",
  },
  {
    title: "Choose a country",
    body: "Each service shows only the countries with numbers currently in stock, with the exact price for that pair.",
  },
  {
    title: "Purchase a virtual number",
    body: "Buying takes the price from your wallet immediately and assigns you the number for one verification session.",
  },
  {
    title: "Use the number on the service",
    body: "Enter the number where the third-party service asks for a phone number, and request its verification code as normal.",
  },
  {
    title: "Receive the SMS code",
    body: "The code appears on your Xencodes activation page as soon as the service sends it. You don't need to refresh.",
  },
  {
    title: "Complete your verification",
    body: "Enter the code back on the service to finish verifying the account. Your Xencodes number's job is done.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to verify an account with a Xencodes virtual number",
          description:
            "Create an account, fund your wallet, choose a service and country, purchase a virtual number, and receive your SMS verification code.",
          step: STEPS.map((step) => ({
            "@type": "HowToStep",
            name: step.title,
            text: step.body,
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": `${SITE_URL}/how-it-works/#page`,
          url: `${SITE_URL}/how-it-works`,
          isPartOf: { "@id": `${SITE_URL}/#website` },
        }}
      />

      <PageHero
        crumbs={[{ label: "How It Works" }]}
        eyebrow="How it works"
        title="From sign-up to verified, step by step"
        description="Eight steps from creating an account to completing a verification with your virtual number. No app to install."
      >
        <Button href="/buy" variant="accent" size="lg">
          Get a number
          <ArrowRight className="h-4 w-4" />
        </Button>
      </PageHero>

      <Container className="py-12 sm:py-16">
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-4 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-subtle)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest font-mono text-sm font-semibold text-mint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-semibold">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex gap-4 rounded-xl border border-mint/40 bg-mint-soft/60 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-forest">
            <RotateCcw className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">If no code arrives</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              If your session ends without a valid code, the full amount is
              refunded to your Xencodes wallet automatically. You don&apos;t
              need to ask. You can also cancel an activation yourself before it
              expires for the same result. A number that does successfully
              receive a code has done its job and isn&apos;t eligible for a
              refund. See the full{" "}
              <Link href="/refund-policy" className="text-forest underline-offset-4 hover:underline">
                Refund Policy
              </Link>{" "}
              for every case.
            </p>
          </div>
        </div>

        <CtaBand
          title="Try it yourself"
          body="Search for your service and see live prices before you buy."
        />
      </Container>
    </>
  );
}
