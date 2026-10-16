import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/ui/flag";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqSection, LinkGrid, StatRow, Steps } from "@/components/seo/blocks";
import { getSeoIndex, getSeoMoney } from "@/lib/seo-catalog";
import { isIndexedPair, loadSeoCountry } from "@/lib/seo-pages";
import { countryFaqs, plural, REFUND_SENTENCE, withArticle } from "@/lib/seo-copy";
import { SITE_URL, ORGANIZATION_REF } from "@/lib/site";

// Built once and served from the cache: nothing here depends on who is looking.
export const dynamic = "force-static";
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadSeoCountry(slug);
  if (!data) return {};
  const { offers, entry } = data;
  const name = offers.country.name;
  const dial = offers.country.dialCode;
  const count = offers.services.length;
  return {
    title: `${name} Virtual Phone Number${dial ? ` (${dial})` : ""}`,
    description: `Get ${withArticle(name)} (${dial}) virtual number to receive SMS verification codes for ${plural(count, "service")}. Live prices, pay per number, automatic refund if no code arrives.`,
    alternates: { canonical: `/countries/${slug}` },
    robots: entry ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function CountryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadSeoCountry(slug);
  if (!data) notFound();
  const { offers } = data;
  const { country } = offers;
  const money = await getSeoMoney();
  const index = await getSeoIndex();

  const services = [...offers.services].sort(
    (a, b) => Number(b.popular) - Number(a.popular) || a.name.localeCompare(b.name, "en"),
  );
  const cheapest = services.length ? Math.min(...services.map((service) => service.fromPriceKobo)) : null;
  const from = cheapest !== null ? money(cheapest) : null;
  const linked = new Set<string>();
  for (const service of services) {
    if (await isIndexedPair(service.slug, slug)) linked.add(service.slug);
  }
  const faqs = countryFaqs({
    country: country.name,
    dialCode: country.dialCode,
    serviceCount: services.length,
    examples: services.filter((service) => service.popular).slice(0, 3).map((service) => service.name),
  });
  const otherCountries = index.countries.filter((entry) => entry.slug !== slug).slice(0, 12);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${SITE_URL}/countries/${slug}#service`,
          name: `${country.name} virtual phone numbers for SMS verification`,
          serviceType: "Virtual phone number for receiving SMS verification codes",
          provider: ORGANIZATION_REF,
          url: `${SITE_URL}/countries/${slug}`,
          areaServed: country.name,
        }}
      />
      <PageHero
        crumbs={[{ label: "Countries", href: "/countries" }, { label: country.name }]}
        eyebrow={`${country.name} ${country.dialCode}`.trim()}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Flag flag={country.flag} className="!h-7 !w-10" />
            <span>{country.name} virtual phone number</span>
          </span>
        }
        description={`Receive SMS verification codes on ${withArticle(country.name)} number${country.dialCode ? ` (${country.dialCode})` : ""} for ${plural(services.length, "service")}. ${REFUND_SENTENCE}`}
      >
        <Button href={`/buy?country=${slug}`} variant="accent" size="lg">
          Buy a {country.name} number
          <ArrowRight className="h-4 w-4" />
        </Button>
      </PageHero>

      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <StatRow
            items={[
              { label: "Services in stock", value: services.length.toLocaleString("en-US") },
              { label: "Prices from", value: from ? `${from.usd} (${from.ngn})` : "On the buy page" },
              { label: "Country code", value: country.dialCode || "On the buy page" },
            ]}
          />

          <section className="mt-10">
            <h2 className="text-xl font-semibold tracking-tight">Services you can verify with a {country.name} number</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Lowest current price for each service. Stock and prices change with supply.</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {services.slice(0, 120).map((service) => (
                <li key={service.slug} className="min-w-0">
                  <Link
                    href={linked.has(service.slug) ? `/services/${service.slug}/${slug}` : `/buy?service=${service.slug}&country=${slug}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-subtle)] transition-colors hover:border-mint/50 hover:bg-mint-soft/40"
                  >
                    <span className="truncate text-sm font-medium">{service.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{money(service.fromPriceKobo).usd}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {services.length > 120 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing 120 of {services.length}. <Link className="underline" href={`/buy?country=${slug}`}>Search them all</Link>.
              </p>
            ) : null}
          </section>

          <div className="mt-10">
            <Steps
              title={`How to get ${withArticle(country.name)} number`}
              steps={[
                { title: "Pick the service", body: `Choose the service you want to verify and select ${country.name}. The exact price is shown before you buy.` },
                { title: "Pay from your wallet", body: "Add funds once; each number is paid for from the wallet and nothing is charged until you buy." },
                { title: "Receive the code", body: `Enter the number in the service, request the code, and read it on your activation page. ${REFUND_SENTENCE}` },
              ]}
            />
          </div>

          <FaqSection items={faqs} />

          <LinkGrid
            title="Numbers from other countries"
            items={otherCountries.map((entry) => ({
              href: `/countries/${entry.slug}`,
              label: `${entry.name} virtual number`,
              hint: `${entry.dialCode} · ${plural(entry.serviceCount, "service")}`,
              leading: <Flag flag={entry.flag} />,
            }))}
            moreHref="/countries"
            moreLabel="All countries"
          />

          <CtaBand title={`Get ${withArticle(country.name)} number`} body="Choose a service and see the live price." href={`/buy?country=${slug}`} label="Buy a number" />
        </div>
      </Container>
    </>
  );
}
