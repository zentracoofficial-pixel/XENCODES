import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
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
    body: "Add funds in NGN through KoraPay — card, bank transfer or USSD. Nothing is spent until you buy a number.",
  },
  {
    title: "Choose a service",
    body: "Search for the platform you need to verify — WhatsApp, Telegram, a marketplace account, or any other supported service.",
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
    body: "The code appears on your Xencodes activation page as soon as the service sends it — most arrive within seconds.",
  },
  {
    title: "Complete your verification",
    body: "Enter the code back on the service to finish verifying the account. Your Xencodes number's job is done.",
  },
];

export default function HowItWorksPage() {
  return (
    <Container className="py-10 sm:py-14">
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

      <Breadcrumbs items={[{ label: "How It Works" }]} />

      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          How Xencodes works
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
          Eight steps from creating an account to completing a verification
          with your virtual number.
        </p>

        <ol className="mt-8 space-y-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-soft font-mono text-sm font-medium text-forest">
                {index + 1}
              </span>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-xl border border-border bg-surface p-5">
          <p className="text-sm font-medium">If no code arrives</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            If your session ends without a valid code, the full amount is
            refunded to your Xencodes wallet automatically — you don&apos;t
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

        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl bg-forest px-6 py-6">
          <div className="flex-1">
            <p className="text-base font-semibold text-white">Try it yourself</p>
            <p className="mt-1 text-sm text-white/70">
              Search for your service and see live prices before you buy.
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
