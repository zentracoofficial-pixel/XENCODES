import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight, Info } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/ui/flag";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqSection, LinkGrid, StatRow, Steps } from "@/components/seo/blocks";
import { getServicePageContent } from "@/data/service-pages";
import { getSeoIndex, getSeoMoney } from "@/lib/seo-catalog";
import { isIndexedPair, loadSeoService } from "@/lib/seo-pages";
import { plural, REFUND_SENTENCE, serviceFaqs } from "@/lib/seo-copy";
import { SITE_URL, ORGANIZATION_REF } from "@/lib/site";

// Built on the first visit and served from the cache, refreshed hourly.
// Built once and served from the cache: nothing here depends on who is looking.
export const dynamic = "force-static";
export const revalidate = 3600;

/** Services that had their own page before the 12 September 2026 rebuild.
 *  When one is not on sale right now it still sends the visitor to the buy
 *  page rather than a 404. */
const PRE_REBUILD_SERVICE_SLUGS = new Set([
  "instagram", "tiktok", "google", "fiverr", "upwork", "discord", "paypal", "amazon", "linkedin",
]);

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const curated = getServicePageContent(slug);
  const { offers, entry } = await loadSeoService(slug);
  const name = offers?.service.name ?? curated?.name;
  if (!name) return {};

  const money = await getSeoMoney();
  const cheapest = offers ? Math.min(...offers.countries.map((country) => country.fromPriceKobo)) : null;
  const from = cheapest !== null ? money(cheapest).usd : null;
  const count = offers?.countries.length ?? 0;
  // Curated services always have a page; the rest only when they reach
  // enough countries to be worth one.
  const indexable = Boolean(curated) || Boolean(entry);

  return {
    title: `${name} Virtual Number for SMS Verification`,
    description: `Get a ${name} virtual number and receive your SMS verification code online${count ? ` from ${plural(count, "country", "countries")}` : ""}${from ? `, from ${from}` : ""}. Pay per number, refunded automatically if no code arrives.`,
    alternates: { canonical: `/services/${slug}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: `${name} virtual number for SMS verification`, type: "website", url: `/services/${slug}` },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const curated = getServicePageContent(slug);
  const { offers } = await loadSeoService(slug);

  if (!offers && !curated) {
    // An old per-service URL goes to the buy page; anything else was never a service here.
    if (PRE_REBUILD_SERVICE_SLUGS.has(slug)) permanentRedirect(`/buy?service=${slug}`);
    notFound();
  }

  const name = offers?.service.name ?? curated!.name;
  const money = await getSeoMoney();
  const countries = offers?.countries ?? [];
  const cheapest = countries.length ? Math.min(...countries.map((country) => country.fromPriceKobo)) : null;
  const from = cheapest !== null ? money(cheapest) : null;
  const index = await getSeoIndex();

  // Pairs worth a page of their own are linked; the rest go straight to buy.
  const pairLinked = new Set<string>();
  for (const country of countries) {
    if (await isIndexedPair(slug, country.slug)) pairLinked.add(country.slug);
  }

  const useCase =
    curated?.useCase ??
    `${name} may ask for a phone number to verify a new account or a sign-in, and texts a one-time code to it. A Xencodes virtual number receives that code, so you can complete the step without using your personal number.`;
  const howItWorks =
    curated?.howItWorks ??
    `Choose ${name}, pick a country that has numbers in stock, and buy a number. Enter it where ${name} asks for a phone number, request the code, and it appears on your Xencodes activation page.`;
  const limitations =
    curated?.limitations ?? [
      `${name} decides which numbers it accepts. If one is rejected, try a number from another country.`,
      "The number receives the code for this one activation; it is not a permanent line and cannot receive later codes.",
      "Prices and stock change with supply, so what is listed here is what is on sale right now.",
    ];

  const examples = countries.slice(0, 3).map((country) => country.name);
  const faqs = serviceFaqs({ name, countryCount: countries.length, fromUsd: from?.usd ?? null, exampleCountries: examples });
  const related = index.services.filter((service) => service.slug !== slug && service.featured).slice(0, 8);
  const highest = countries.length ? Math.max(...countries.map((country) => country.fromPriceKobo)) : null;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${SITE_URL}/services/${slug}#service`,
          name: `${name} SMS verification number`,
          serviceType: "Virtual phone number for receiving SMS verification codes",
          provider: ORGANIZATION_REF,
          url: `${SITE_URL}/services/${slug}`,
          areaServed: "Worldwide",
          ...(from?.usdNumber != null && highest !== null && money(highest).usdNumber != null
            ? {
                offers: {
                  "@type": "AggregateOffer",
                  priceCurrency: "USD",
                  lowPrice: from.usdNumber,
                  highPrice: money(highest).usdNumber,
                  offerCount: countries.length,
                },
              }
            : {}),
        }}
      />

      <PageHero
        crumbs={[{ label: "Services", href: "/services" }, { label: name }]}
        eyebrow={`${name} verification`}
        title={`${name} virtual number for SMS verification`}
        description={useCase}
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button href={`/buy?service=${slug}`} variant="accent" size="lg">
            Buy a {name} number
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Link href="/how-it-works" className="text-sm font-medium text-forest hover:underline">
            How it works
          </Link>
        </div>
      </PageHero>

      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          {countries.length === 0 ? (
            <div className="mb-8 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
              {name} is not on sale right now. Check back soon, or browse the{" "}
              <Link href="/services" className="underline">
                full service list
              </Link>
              .
            </div>
          ) : (
            <StatRow
              items={[
                { label: "Countries in stock", value: countries.length.toLocaleString("en-US") },
                { label: "Prices from", value: from ? `${from.usd} (${from.ngn})` : "On the buy page" },
                { label: "No code?", value: "Automatic refund" },
              ]}
            />
          )}

          {countries.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-xl font-semibold tracking-tight">{name} numbers by country</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                What is on sale at this moment, from the lowest current price. {REFUND_SENTENCE}
              </p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {countries.map((country) => (
                  <li key={country.slug} className="min-w-0">
                    <Link
                      href={pairLinked.has(country.slug) ? `/services/${slug}/${country.slug}` : `/buy?service=${slug}&country=${country.slug}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-subtle)] transition-colors hover:border-mint/50 hover:bg-mint-soft/40"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Flag flag={country.flag} />
                        <span className="truncate text-sm font-medium">{country.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{country.dialCode}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(country.fromPriceKobo).usd}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-10 grid gap-4">
            <Steps
              title={`How to get a ${name} number`}
              steps={[
                { title: "Choose a country", body: howItWorks },
                { title: "Pay from your wallet", body: "Add funds once, then each number is paid for from the wallet. The exact price is shown before you buy." },
                { title: "Read the code", body: `Enter the number in ${name}, request the code, and it appears on your activation page. ${REFUND_SENTENCE}` },
              ]}
            />
            <section className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint-soft text-forest">
                  <Info className="h-[18px] w-[18px]" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">Good to know</h2>
              </div>
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted-foreground marker:text-mint">
                {limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </section>
          </div>

          <FaqSection items={faqs} />

          <LinkGrid
            title="Other services people verify"
            items={related.map((service) => ({
              href: `/services/${service.slug}`,
              label: `${service.name} virtual number`,
              hint: `${plural(service.countryCount, "country", "countries")}`,
            }))}
            moreHref="/services"
            moreLabel="All services"
          />

          <CtaBand title={`Get a ${name} number`} body="See live availability and pick your country." href={`/buy?service=${slug}`} label="Buy a number" />
        </div>
      </Container>
    </>
  );
}
