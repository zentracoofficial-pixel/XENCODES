import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  Globe2,
  MessageSquareText,
  RotateCcw,
  Route,
  Search,
  Wallet,
  Banknote,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { ServicePicker } from "@/components/product/service-picker";
import { ServiceMarquee } from "@/components/product/service-marquee";
import { ActivationDemo } from "@/components/product/activation-demo";
import { TrustSection } from "@/components/marketing/trust-section";
import {
  searchServices,
  countServices,
  getInventoryStatus,
  getCatalogHighlights,
} from "@/lib/inventory";
import { HOMEPAGE_SHOWCASE_ROWS } from "@/data/homepage-showcase";
import { faqs } from "@/data/faq";
import { SITE_NAME, SITE_URL, SITE_LOGO_URL, SUPPORT_EMAIL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Virtual Numbers for SMS Verification, Worldwide",
  description:
    "Xencodes is a virtual SMS verification platform. Search for the service you need, choose a country, and get a virtual number that receives your SMS verification code in seconds. Pay as you go, refunded automatically when no code arrives.",
  keywords: [
    "virtual number for SMS verification",
    "SMS verification number",
    "WhatsApp verification number",
    "Telegram virtual number",
    "receive SMS online",
  ],
  alternates: { canonical: "/" },
};

/** What a first-time visitor needs to know before trusting a number site
 *  with money. Each is a real mechanism; see TrustSection's own comment for
 *  where each one lives in the code. */
const HERO_PROOF = [
  { icon: RotateCcw, title: "No code, no charge", body: "Refunded to your wallet automatically" },
  { icon: Eye, title: "Exact price upfront", body: "Shown before you pay, every time" },
  { icon: Route, title: "Delivery first", body: "Routed to sellers that actually deliver" },
];

const STEPS = [
  { icon: Search, title: "Search", body: "Find the service you need a number for in the live catalog." },
  { icon: Globe2, title: "Choose", body: "Pick an available country and see the exact price before you pay." },
  { icon: MessageSquareText, title: "Receive", body: "Your verification code appears on the activation page on its own." },
];

const PRICING_POINTS = [
  {
    icon: Wallet,
    title: "No plans",
    body: "No subscription and no minimum. Add funds to your wallet and spend them a number at a time.",
  },
  {
    icon: Banknote,
    title: "Priced in Naira",
    body: "Xencodes currently operates in NGN, with nothing added at checkout beyond KoraPay's own processing fee.",
  },
  {
    icon: RotateCcw,
    title: "No code, no charge",
    body: "If no code arrives before the session ends, the full amount returns to your wallet.",
  },
];

export default async function HomePage() {
  const [status, services, serviceCount, highlights] = await Promise.all([
    getInventoryStatus(),
    searchServices("").catch(() => []),
    countServices().catch(() => 0),
    getCatalogHighlights().catch(() => ({ startingPriceKobo: null, countryCount: null })),
  ]);

  // "Numbers on sale now" and the live counts only when that is true.
  const live = status.connected && serviceCount > 0;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          "@id": `${SITE_URL}/#website`,
          name: SITE_NAME,
          url: SITE_URL,
          description:
            "Xencodes is a virtual SMS verification platform: virtual phone numbers for receiving SMS verification codes across supported online services, priced in Nigerian Naira.",
          publisher: { "@id": `${SITE_URL}/#organization` },
          inLanguage: "en",
        }}
      />
      {/* Helps Google (and any system reading this page) identify Xencodes
          as one consistent real-world entity, not just this one page. Only
          fields that are actually true: no sameAs (no official public
          social profiles exist yet to point to), no address or founding
          date that would be invented for this. contactPoint uses the same
          support address shown on the dashboard's own "Contact support"
          card, never a second, unlisted one. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": `${SITE_URL}/#organization`,
          name: SITE_NAME,
          url: SITE_URL,
          logo: SITE_LOGO_URL,
          description:
            "Xencodes provides virtual phone numbers for receiving SMS verification codes across supported online services. Users choose a service and country, purchase a number, and receive the verification code through their Xencodes activation.",
          contactPoint: [
            { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          // Matches exactly what FaqAccordion below actually renders: the
          // structured data must describe what's really on the page, not a
          // longer list than a visitor (or a crawler) can actually see here.
          mainEntity: faqs.slice(0, 5).map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }}
      />

      {/* Hero. Deep brand green, so the one thing to do here (search for
          a service, or press Get a number) is the brightest thing on the
          screen. Everything stated is true right now: the "on sale" line
          and the counts only appear when numbers really are on sale. */}
      <section className="relative isolate overflow-hidden bg-forest text-white">
        <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 -z-10" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-40 -z-10 h-[34rem] w-[34rem] rounded-full bg-mint/20 blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-56 -left-40 -z-10 h-[28rem] w-[28rem] rounded-full bg-mint/10 blur-[110px]"
        />

        <Container className="pb-14 pt-12 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
          {/* Three grid items, so a phone gets headline, then the search,
              then the proof points (the search is the fastest way in),
              while a desktop keeps the search beside both. */}
          <div className="grid items-center gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            <div className="lg:col-start-1 lg:row-start-1">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/85">
                {live ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-live rounded-full bg-mint" aria-hidden />
                    Numbers on sale now
                  </>
                ) : (
                  "Virtual numbers for SMS verification"
                )}
              </p>

              <h1 className="mt-5 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.1rem]">
                Find a number.
                <br />
                <span className="text-mint">Get your code.</span>
              </h1>

              <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-white/75 text-pretty sm:text-lg">
                Virtual phone numbers for SMS verification. Pick the service and
                country you need, and your code arrives on your activation page
                in real time.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Button href="/buy" variant="accent" size="lg" className="shadow-[0_10px_30px_-10px_rgba(11,217,154,0.65)]">
                  Get a number
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center gap-1.5 py-2 text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  See how it works
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>

            </div>

            <div className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-mint">
                Start here
              </p>
              {/* text-foreground: the panel is a light card, and must not
                  inherit the hero's white text. */}
              <div className="rounded-[1.35rem] bg-white/[0.06] p-1.5 text-foreground ring-1 ring-inset ring-white/10 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.55)]">
                <ServicePicker
                  initialServices={services}
                  unavailableMessage={status.connected ? undefined : status.message}
                />
              </div>

              {/* Only figures that are true right now, and only while numbers
                  are on sale. No "starting at" price: the catalog only knows
                  each pair's cheapest supplier tier, while a real quote comes
                  from the tier Xencodes actually buys from (see
                  pool-ladder.ts), so a "from" figure would understate it. */}
              {live ? (
                <dl className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/65">
                  <div className="flex items-baseline gap-1.5">
                    <dd className="font-semibold tabular-nums text-white">
                      {serviceCount.toLocaleString("en-US")}
                    </dd>
                    <dt>services</dt>
                  </div>
                  {highlights.countryCount !== null && highlights.countryCount > 0 ? (
                    <div className="flex items-baseline gap-1.5">
                      <dd className="font-semibold tabular-nums text-white">
                        {highlights.countryCount.toLocaleString("en-US")}
                      </dd>
                      <dt>countries</dt>
                    </div>
                  ) : null}
                  <div className="flex items-baseline gap-1.5">
                    <dt className="sr-only">Pricing</dt>
                    <dd>Pay per number</dd>
                  </div>
                </dl>
              ) : null}
            </div>

            <ul className="grid gap-4 border-t border-white/10 pt-7 sm:grid-cols-3 sm:gap-5 lg:col-start-1 lg:row-start-2 lg:self-start">
              {HERO_PROOF.map((item) => (
                <li key={item.title} className="flex items-start gap-3 sm:block">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-mint ring-1 ring-inset ring-white/10">
                    <item.icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <div className="sm:mt-3">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-white/60">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* A curated, static showcase, not a view onto the live catalog: it
          renders the same way whether or not the provider is reachable
          right now, and it never claims a brand shown here is on sale.
          See data/homepage-showcase.ts for why the list is fixed and the
          logos are not links. */}
      <Section className="py-14 sm:py-16">
        <Container>
          <SectionHeading
            eyebrow="Services"
            title="Built for the services people verify most"
            description="A sample of what people commonly need a number for. Browse the live catalog to see exactly what is available and priced right now."
            action={
              <Link
                href="/services"
                className="inline-flex items-center gap-1.5 py-3 -my-3 text-sm font-medium text-forest hover:underline"
              >
                View live catalog
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        </Container>

        <div className="mt-8">
          <ServiceMarquee rows={[...HOMEPAGE_SHOWCASE_ROWS]} />
        </div>
      </Section>

      {/* How it works, next to a preview of the interface itself. */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-border bg-surface">
        <Container className="py-14 sm:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <SectionHeading
                eyebrow="How it works"
                title="From search to code in three steps"
                description="No app to install and nothing to configure. Everything happens on one page."
              />
              <ol className="mt-8 space-y-3">
                {STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="flex gap-4 rounded-xl border border-border bg-background/60 p-4"
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest text-mint">
                      <step.icon className="h-5 w-5" aria-hidden />
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-mint font-mono text-[10px] font-bold text-forest-dark">
                        {index + 1}
                      </span>
                    </span>
                    <div>
                      <p className="font-semibold">{step.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                What buying a number looks like
              </p>
              <ActivationDemo />
            </div>
          </div>
        </Container>
      </section>

      <TrustSection />

      {/* Pricing. Described, never quoted: a number's price depends on the
          service and the country, and the only figure worth showing is the
          live one on the buy page. */}
      <section className="border-y border-border bg-surface">
        <Container className="py-14 sm:py-16">
          <SectionHeading
            eyebrow="Pricing"
            title="Simple pay as you go pricing"
            description="You pay per number. The price depends on the service and the country, and you see the exact figure before you buy."
            action={
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 py-3 -my-3 text-sm font-medium text-forest hover:underline"
              >
                How pricing works
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />

          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {PRICING_POINTS.map((item) => (
              <li key={item.title} className="rounded-xl border border-border bg-background/60 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint-soft text-forest">
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-4 text-[15px] font-semibold">{item.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* FAQ. */}
      <Section className="py-14 sm:py-16">
        <Container>
          <SectionHeading
            eyebrow="FAQ"
            title="Questions, answered"
            action={
              <Link
                href="/faq"
                className="inline-flex items-center gap-1.5 py-3 -my-3 text-sm font-medium text-forest hover:underline"
              >
                All questions
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="mt-8">
            <FaqAccordion items={faqs.slice(0, 5)} />
          </div>
        </Container>
      </Section>

      {/* Closing action. */}
      <Section className="pb-16 pt-0 sm:pb-24 sm:pt-0">
        <Container>
          <div className="relative isolate overflow-hidden rounded-3xl bg-forest px-6 py-12 text-center sm:px-12 sm:py-16">
            <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 -z-10" />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-mint/20 blur-[100px]"
            />
            <h2 className="mx-auto max-w-xl text-2xl font-semibold tracking-tight text-white text-balance sm:text-4xl">
              Your verification code is one search away
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-white/70">
              Create a free account, add funds, and get the number you need.
              No code, no charge.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button href="/buy" variant="accent" size="lg">
                Get a number
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button href="/register" variant="onDark" size="lg">
                Create a free account
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
