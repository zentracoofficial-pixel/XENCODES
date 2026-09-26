import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
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
import { SITE_NAME, SITE_URL, SITE_LOGO_URL } from "@/lib/site";
import { formatMoney } from "@/lib/currency";
import { getDefaultCurrency } from "@/lib/currency-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Virtual Numbers for SMS Verification, Worldwide",
  description:
    "Search for the service you need, choose a country, and get a virtual number that receives your SMS verification code in seconds. Pay as you go in your own currency, refunded when no code arrives.",
  keywords: [
    "virtual number for SMS verification",
    "SMS verification number",
    "WhatsApp verification number",
    "Telegram virtual number",
    "receive SMS online",
  ],
  alternates: { canonical: "/" },
};

const STEPS = [
  { n: "01", title: "Search", body: "Find the service you need a number for." },
  { n: "02", title: "Choose", body: "Pick an available country and see the exact price." },
  { n: "03", title: "Receive", body: "Your SMS verification code appears on its own." },
];

export default async function HomePage() {
  const [status, services, serviceCount, highlights, defaultCurrency] = await Promise.all([
    getInventoryStatus(),
    searchServices("").catch(() => []),
    countServices().catch(() => 0),
    getCatalogHighlights().catch(() => ({ startingPriceKobo: null, countryCount: null })),
    getDefaultCurrency(),
  ]);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
          description:
            "Virtual phone numbers for receiving SMS verification codes, priced in your own currency.",
        }}
      />
      {/* Helps Google identify Xencodes as an organization distinct from
          the page content itself. Only fields that are actually true:
          no sameAs (no public social profiles to point to yet), no
          address or founding date that would be invented for this. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: SITE_NAME,
          url: SITE_URL,
          logo: SITE_LOGO_URL,
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

      {/* Hero. The product itself is the visual. */}
      <section className="border-b border-border bg-surface">
        <Container className="pb-12 pt-12 sm:pb-14 sm:pt-16">
          <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-12">
            <div className="lg:pt-4">
              <h1 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.03em] text-balance sm:text-5xl">
                Find a number.
                <br />
                Get your code.
              </h1>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted-foreground text-pretty">
                Search for the service you need, choose a country, and receive
                your verification SMS in real time.
              </p>

              {/* Only figures that are true right now. With nothing on sale
                  there is no service count, no starting price and no
                  location count, so each is left out rather than shown as
                  zero. */}
              <dl className="mt-7 flex flex-wrap gap-x-9 gap-y-4">
                {serviceCount > 0 ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Services</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                      {serviceCount.toLocaleString("en-US")}
                    </dd>
                  </div>
                ) : null}
                {highlights.startingPriceKobo !== null ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Starting at</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                      {formatMoney(highlights.startingPriceKobo, defaultCurrency.code)}
                    </dd>
                  </div>
                ) : null}
                {highlights.countryCount !== null && highlights.countryCount > 0 ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Locations</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                      {highlights.countryCount.toLocaleString("en-US")}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-7 flex max-w-sm items-start gap-2.5 rounded-lg bg-mint-soft px-3.5 py-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                <p className="text-sm leading-relaxed text-forest">
                  No code arrives, no charge. Every failed activation is
                  refunded to your wallet automatically.
                </p>
              </div>
            </div>

            <div>
              <ServicePicker
                initialServices={services}
                unavailableMessage={status.connected ? undefined : status.message}
              />
            </div>
          </div>
        </Container>
      </section>

      {/* A curated, static showcase, not a view onto the live catalog: it
          renders the same way whether or not the provider is reachable
          right now, and it never claims a brand shown here is on sale.
          See data/homepage-showcase.ts for why the list is fixed and the
          logos are not links. */}
      <Section className="py-12 sm:py-14">
        <Container>
          <SectionHeading
            title="Built for the services people verify most"
            description="A sample of what people commonly need a number for. Search above, or browse the live catalog, to see exactly what's available and priced right now."
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

        <div className="mt-6">
          <ServiceMarquee rows={[...HOMEPAGE_SHOWCASE_ROWS]} />
        </div>
      </Section>

      {/* How it works, next to a preview of the interface itself. */}
      <section className="border-y border-border bg-surface">
        <Container className="py-14 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <SectionHeading
                title="How it works"
                description="Three steps from landing here to pasting your code."
              />
              <ol className="mt-8 space-y-6">
                {STEPS.map((step) => (
                  <li key={step.n} className="flex gap-4">
                    <span className="font-mono text-sm font-medium text-mint">
                      {step.n}
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
      <Section className="py-12 sm:py-14">
        <Container>
          <SectionHeading
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

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {[
              {
                title: "No plans",
                body: "No subscription and no minimum. Add funds to your wallet and spend them a number at a time.",
              },
              {
                title: "Priced in NGN or USD",
                body: "Nigeria pays in NGN, everywhere else pays in USD, with nothing added at checkout.",
              },
              {
                title: "No code, no charge",
                body: "If no code arrives before the session ends, the full amount returns to your wallet.",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="rounded-xl border border-border bg-surface px-4 py-4"
              >
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* FAQ. */}
      <Section className="pb-12 pt-2 sm:pb-14 sm:pt-2">
        <Container>
          <SectionHeading
            title="Questions"
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
          <div className="mt-6">
            <FaqAccordion items={faqs.slice(0, 5)} />
          </div>
        </Container>
      </Section>

      {/* Closing action. */}
      <Section className="pb-16 pt-0 sm:pb-20 sm:pt-0">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-forest px-6 py-8 sm:px-10">
            <div>
              <h2 className="text-xl font-semibold text-white sm:text-2xl">
                Ready for your number?
              </h2>
              <p className="mt-1.5 text-sm text-white/70">
                Search for your service and get started.
              </p>
            </div>
            <Button href="/buy" variant="accent" size="lg">
              Get a Number
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
