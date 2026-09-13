import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { NumberSearch } from "@/components/product/number-search";
import { ActivationDemo } from "@/components/product/activation-demo";
import { ServiceMarquee } from "@/components/product/service-marquee";
import { DevelopmentDataNotice } from "@/components/product/development-notice";
import { getCatalog } from "@/lib/catalog";
import { formatNairaFromNaira } from "@/lib/currency";
import { faqs } from "@/data/faq";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Virtual Numbers for SMS Verification in Nigeria",
  description:
    "Search for the service you need, choose a country, and get a virtual number that receives your SMS verification code in seconds. Pay as you go in Naira, refunded when no code arrives.",
  keywords: [
    "virtual number Nigeria",
    "SMS verification number",
    "WhatsApp verification number",
    "Telegram virtual number",
    "receive SMS online Nigeria",
  ],
  alternates: { canonical: "/" },
};

const STEPS = [
  { n: "01", title: "Search", body: "Find the service you need." },
  { n: "02", title: "Choose", body: "Select an available country and number." },
  { n: "03", title: "Receive", body: "Get your SMS verification code." },
];

export default async function HomePage() {
  const [{ services, countries, floorNaira, isLive }, numbersDelivered] = await Promise.all([
    getCatalog(),
    // A real, live count, never invented: this is exactly what it says.
    prisma.activation.count({ where: { status: "RECEIVED" } }),
  ]);

  // Three real examples straight from the catalog, never invented.
  const priceExamples = ["instagram", "telegram", "facebook"]
    .map((slug) => services.find((s) => s.slug === slug))
    .filter((service) => service !== undefined)
    .map((service) => ({ service, offer: service.offers[0] }))
    .filter((row) => row.offer !== undefined);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE_NAME,
          url: SITE_URL,
          description:
            "Virtual phone numbers for receiving SMS verification codes, priced in Naira.",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.slice(0, 6).map((item) => ({
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

              <dl className="mt-7 flex flex-wrap gap-x-9 gap-y-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Numbers from</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                    {floorNaira > 0 ? formatNairaFromNaira(floorNaira) : "Coming soon"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Services</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                    {services.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Countries</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                    {countries.length}
                  </dd>
                </div>
                {numbersDelivered > 0 ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Delivered</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                      {numbersDelivered.toLocaleString("en-NG")}
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
              <NumberSearch services={services} />
              {!isLive ? <DevelopmentDataNotice className="mt-3" /> : null}
            </div>
          </div>
        </Container>
      </section>

      {/* Everything you can verify, drifting past. Full width on purpose,
          so the rows run past the edges of the page rather than stopping. */}
      <Section className="py-12 sm:py-14">
        <Container>
          <SectionHeading
            title="Services we cover"
            description={`${services.length} services and counting. Tap any one to pick a country.`}
            action={
              <Link
                href="/services"
                className="inline-flex items-center gap-1.5 py-3 -my-3 text-sm font-medium text-forest hover:underline"
              >
                View all services
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        </Container>

        <div className="mt-6">
          <ServiceMarquee services={services} />
        </div>
      </Section>

      {/* How it works, and what receiving a code looks like. */}
      <section className="border-y border-border bg-surface">
        <Container className="py-14 sm:py-20">
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
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Your activation page
              </p>
              <ActivationDemo />
              <p className="mt-3 text-xs text-muted-foreground">
                Example of the live interface. Codes appear on their own, with
                no refreshing.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Pricing preview. */}
      <Section className="py-12 sm:py-14">
        <Container>
          <SectionHeading
            title="Simple pay as you go pricing"
            description="You pay per number. The price depends on the service and the country, and you see it before you buy."
            action={
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 py-3 -my-3 text-sm font-medium text-forest hover:underline"
              >
                View pricing
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {priceExamples.map(({ service, offer }) => (
              <li
                key={service.slug}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ServiceLogo
                    slug={service.slug}
                    name={service.name}
                    color={service.color}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{service.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span aria-hidden>{offer.flag}</span> {offer.countryName}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  from {formatNairaFromNaira(offer.priceNaira)}
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
