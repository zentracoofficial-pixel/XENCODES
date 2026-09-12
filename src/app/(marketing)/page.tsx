import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JsonLd } from "@/components/seo/json-ld";
import { PricePicker } from "@/components/marketing/price-picker";
import { CodeArrival } from "@/components/marketing/code-arrival";
import { ServiceChip } from "@/components/marketing/service-chip";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { services, catalogFloorNaira } from "@/data/services";
import { countries } from "@/data/countries";
import { faqs } from "@/data/faq";
import { formatNairaFromNaira } from "@/lib/currency";
import { SITE_URL, SITE_NAME } from "@/lib/site";

const floorPrice = formatNairaFromNaira(catalogFloorNaira);

export const metadata: Metadata = {
  title: "Virtual Numbers for SMS Verification in Nigeria",
  description: `Buy a virtual phone number and receive your SMS verification code in seconds. WhatsApp, Telegram, Instagram, Facebook and more — priced in Naira from ${floorPrice}. No code, no charge.`,
  keywords: [
    "virtual number Nigeria",
    "receive SMS online Nigeria",
    "SMS verification Nigeria",
    "OTP verification number",
    "temporary phone number Nigeria",
    "WhatsApp verification number",
    "buy virtual number Naira",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Virtual Numbers for SMS Verification in Nigeria — Xencodes",
    description: `Get a virtual number and receive your SMS code in seconds. Priced in Naira from ${floorPrice}. If no code arrives, you don't pay.`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Virtual Numbers for SMS Verification in Nigeria — Xencodes",
    description: `Get a virtual number and receive your SMS code in seconds. From ${floorPrice}.`,
  },
};

const popularSlugs = [
  "whatsapp",
  "telegram",
  "instagram",
  "facebook",
  "tiktok",
  "discord",
  "fiverr",
  "upwork",
];

const steps = [
  {
    title: "Pick a service and country",
    body: "Search the catalog, see live availability and the exact price in Naira before you commit.",
  },
  {
    title: "Buy the number",
    body: "Your wallet is debited and the number is reserved to you instantly — nobody else can use it.",
  },
  {
    title: "Read your code",
    body: "Enter the number where you're verifying. The SMS lands on your screen with the code pulled out.",
  },
];

export default function HomePage() {
  const liveServices = services.length;
  const liveCountries = countries.length;
  const activeEntries = services
    .flatMap((s) => s.availability)
    .filter((a) => a.status !== "unavailable");
  const avgDelivery = Math.round(
    activeEntries.reduce((sum, a) => sum + a.avgDeliverySeconds, 0) /
      activeEntries.length,
  );

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "Xencodes sells virtual phone numbers for receiving SMS verification codes, priced in Naira.",
    areaServed: "NG",
  };

  const serviceLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Virtual number for SMS verification",
    provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    areaServed: "NG",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "NGN",
      lowPrice: catalogFloorNaira,
      offerCount: services.length,
    },
  };

  return (
    <>
      <JsonLd data={orgLd} />
      <JsonLd data={serviceLd} />
      <JsonLd data={faqLd} />

      {/* Hero — the product itself, not a picture of it */}
      <section className="relative overflow-hidden bg-brand-glow">
        <Container className="relative pt-14 pb-16 sm:pt-20 sm:pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              {liveServices} services live across {liveCountries} countries
            </span>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Virtual numbers for{" "}
              <span className="text-primary">SMS verification</span> in Nigeria
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground text-balance">
              Pick a service, pick a country, and read your code off the
              screen. Paid in Naira from {floorPrice} — and if the code never
              lands, you don&apos;t pay for it.
            </p>
          </div>

          {/* The picker is the hero: real prices, before signup */}
          <div className="mx-auto mt-10 max-w-3xl">
            <PricePicker services={services} countries={countries} />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Live prices. No subscription, no minimum — you only pay per code.
            </p>
          </div>
        </Container>
      </section>

      {/* Bento grid */}
      <section className="border-t border-border py-16 sm:py-20">
        <Container>
          <div className="grid gap-4 lg:grid-cols-4 lg:grid-rows-2">
            <Card className="p-6 lg:col-span-2 lg:row-span-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Your code, on your screen</h2>
                <Badge variant="primary">Real time</Badge>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                No refreshing, no forwarding, no waiting on a SIM.
              </p>
              <div className="mt-6">
                <CodeArrival />
              </div>
            </Card>

            <Card className="flex flex-col justify-between p-6 lg:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-5xl font-semibold tracking-tight tabular-nums">
                    {avgDelivery}s
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Average time from purchase to code across live routes.
                  </p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <Clock3 className="h-5 w-5" />
                </span>
              </div>
            </Card>

            <Card className="p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">No code, no charge</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Cancel a number that never delivers and the full amount
                returns to your wallet.
              </p>
            </Card>

            <Card className="p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted text-primary">
                <Wallet className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">Priced in Naira</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Local pricing, no conversion math at checkout.
              </p>
            </Card>
          </div>

          {/* Country rail */}
          <div className="mt-4 flex flex-wrap gap-3">
            {countries.map((country) => (
              <div
                key={country.slug}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="text-lg leading-none">{country.flag}</span>
                <span className="text-sm font-medium">{country.name}</span>
                <span className="text-sm text-muted-foreground">
                  {formatNairaFromNaira(country.priceFromNaira)}
                </span>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Services */}
      <section className="border-t border-border bg-secondary/40 py-16 sm:py-20">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Services people verify most
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Tap one to jump straight into buying a number for it.
              </p>
            </div>
            <Button href="/services" variant="outline" size="sm">
              All {liveServices} services
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {popularSlugs.map((slug) => {
              const service = services.find((s) => s.slug === slug);
              if (!service) return null;
              return <ServiceChip key={slug} service={service} />;
            })}
          </div>
        </Container>
      </section>

      {/* Steps — connected rail rather than three identical cards */}
      <section className="border-t border-border py-16 sm:py-20">
        <Container>
          <h2 className="text-2xl font-semibold tracking-tight">
            How Xencodes works
          </h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-6">
            {steps.map((step, index) => (
              <li key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary-muted text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span
                    aria-hidden
                    className="hidden h-px flex-1 bg-border sm:block"
                  />
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Long-form content: real substance for search, useful for humans */}
      <section className="border-t border-border bg-secondary/40 py-16 sm:py-20">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Getting a virtual number in Nigeria
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  A virtual number is a real phone number that lives in the
                  cloud instead of in a SIM card. It can receive the
                  one-time passcode that a service texts you during sign-up,
                  which means you can verify an account without handing over
                  your personal line or buying another SIM.
                </p>
                <p>
                  On Xencodes you choose the service you&apos;re verifying and
                  the country the number should come from, then pay for that
                  single activation out of your Naira wallet. The number is
                  held for your session only, the message appears in your
                  dashboard the moment it arrives, and the code is pulled out
                  of the text so you can copy it in one tap.
                </p>
                <h3 className="pt-2 text-base font-semibold text-foreground">
                  What it costs
                </h3>
                <p>
                  Prices start at {floorPrice} and move with the service and
                  country you choose, because carrier fees and number supply
                  differ in each market. The exact price is always on screen
                  before you confirm — there is no subscription and no minimum
                  spend.
                </p>
                <h3 className="pt-2 text-base font-semibold text-foreground">
                  If the code never arrives
                </h3>
                <p>
                  Delivery depends on the carrier and on whether the service
                  accepts that number, so it isn&apos;t guaranteed. When a code
                  doesn&apos;t come through within the session, cancel the
                  activation and the full amount returns to your wallet
                  automatically.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button href="/buy">
                  Get a number
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button href="/how-it-works" variant="outline">
                  How it works
                </Button>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Common questions
              </h2>
              <div className="mt-5">
                <FaqAccordion items={faqs.slice(0, 6)} />
              </div>
              <Link
                href="/faq"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Read the full FAQ
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Close */}
      <section className="py-16 sm:py-24">
        <Container>
          <Card className="flex flex-col items-center gap-6 border-transparent bg-foreground px-8 py-14 text-center text-background sm:px-16">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Zap className="h-5 w-5" />
            </span>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Verify something in the next five minutes
            </h2>
            <p className="max-w-lg text-background/70">
              Fund your wallet, pick a service, and read your code. Nothing to
              install and nothing to cancel later.
            </p>
            <Button href="/register" size="lg">
              Create a free account
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-background/60">
              <BadgeCheck className="h-3.5 w-3.5" />
              Independent service — not affiliated with the platforms listed
            </p>
          </Card>
        </Container>
      </section>
    </>
  );
}
