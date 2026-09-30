import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { UnavailableNotice } from "@/components/product/unavailable-notice";
import { getServiceMeta, getServiceCountries, getInventoryStatus } from "@/lib/inventory";
import { getVisitorCurrency } from "@/lib/currency-config";
import { formatMoney } from "@/lib/currency";
import { SITE_URL } from "@/lib/site";
import { SERVICE_PAGES, getServicePageContent } from "@/data/service-pages";

export const dynamic = "force-dynamic";

/** Only these slugs get an individual page — a small, curated list with
 *  real service-specific content, never generated in bulk from the catalog.
 *  See src/data/service-pages.ts for why each one is here. */
export function generateStaticParams() {
  return SERVICE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const content = getServicePageContent(slug);
  if (!content) return {};

  return {
    title: `${content.name} Virtual Number for SMS Verification`,
    description: `Get a virtual number for ${content.name} SMS verification with Xencodes. ${content.useCase}`,
    alternates: { canonical: `/services/${slug}` },
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = getServicePageContent(slug);
  // Not in the curated whitelist at all: this route only exists for the
  // small set of services with real editorial content, per the standing
  // instruction against generating pages in bulk. Everything else is still
  // reachable and purchasable from the live catalog at /services.
  if (!content) notFound();

  const currency = await getVisitorCurrency();
  const [meta, countries, status] = await Promise.all([
    getServiceMeta(slug),
    getServiceCountries(slug, currency),
    getInventoryStatus(),
  ]);

  // The service is temporarily disabled or absent from the live catalog
  // right now: shown honestly, never as if it were still on sale. The page
  // itself stays up (and indexable) since the service is genuinely
  // supported by Xencodes in general — availability just changes with
  // stock, exactly as the rest of the site already explains.
  const currentlyListed = meta !== null;
  const topCountries = countries.slice(0, 8);

  return (
    <Container className="py-10 sm:py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${SITE_URL}/services/${slug}/#service`,
          name: `${content.name} SMS Verification`,
          serviceType: "Virtual phone number for SMS verification",
          provider: { "@id": `${SITE_URL}/#organization` },
          areaServed: topCountries.map((c) => c.name),
          url: `${SITE_URL}/services/${slug}`,
        }}
      />

      <Breadcrumbs items={[{ label: "Services", href: "/services" }, { label: content.name }]} />

      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {content.name} virtual number for SMS verification
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
          {content.useCase}
        </p>

        {!status.connected ? (
          <UnavailableNotice message={status.message} className="mt-5" />
        ) : !currentlyListed ? (
          <div className="mt-5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
            {content.name} is not currently listed for sale — check back, or
            browse the full{" "}
            <Link href="/services" className="underline">
              live catalog
            </Link>
            .
          </div>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">How it works for {content.name}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{content.howItWorks}</p>
        </section>

        {currentlyListed && topCountries.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">Available countries right now</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Prices and stock change constantly; this reflects what is
              actually available at this moment.
            </p>
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {topCountries.map((country) => (
                <li key={country.slug} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden>{country.flag}</span>
                    <span className="text-sm font-medium">{country.name}</span>
                    {country.recommended ? (
                      <span className="rounded-full bg-mint-soft px-2 py-0.5 text-[11px] font-medium text-forest">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(country.priceKobo, currency.code)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Pricing</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {content.name} numbers are priced per country, in Nigerian
            Naira, from your Xencodes wallet balance — see{" "}
            <Link href="/pricing" className="text-forest underline-offset-4 hover:underline">
              how pricing works
            </Link>{" "}
            for what sets the exact figure. Xencodes never promises
            guaranteed delivery or a specific delivery percentage for any
            country.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Good to know</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted-foreground">
            {content.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3 rounded-2xl bg-forest px-6 py-6">
          <div className="flex-1">
            <p className="text-base font-semibold text-white">
              Get a {content.name} number
            </p>
            <p className="mt-1 text-sm text-white/70">
              See live availability and pick your country.
            </p>
          </div>
          <Button href={`/buy?service=${slug}`} variant="accent">
            Buy a number
          </Button>
        </div>
      </div>
    </Container>
  );
}
