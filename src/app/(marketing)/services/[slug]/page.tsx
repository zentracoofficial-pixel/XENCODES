import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { ArrowRight, Info, ListChecks, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { UnavailableNotice } from "@/components/product/unavailable-notice";
import { getServiceMeta, getServiceCountries, getInventoryStatus } from "@/lib/inventory";
import { getVisitorCurrency } from "@/lib/currency-config";
import { formatMoney } from "@/lib/currency";
import { SITE_URL } from "@/lib/site";
import { SERVICE_PAGES, getServicePageContent } from "@/data/service-pages";

export const dynamic = "force-dynamic";

/**
 * Services that had their own page here before the 12 September 2026 rebuild
 * replaced per-service pages with the live catalog. Search engines indexed
 * them, and each one has a genuine replacement: the buy page with that
 * service already chosen. They redirect there permanently, whatever the
 * catalog says right now, so an old link never lands on a 404 merely because
 * a service is out of stock today.
 */
const PRE_REBUILD_SERVICE_SLUGS = new Set([
  "instagram",
  "tiktok",
  "google",
  "fiverr",
  "upwork",
  "discord",
  "paypal",
  "amazon",
  "linkedin",
]);

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
  if (!content) {
    // An old per-service URL, or any service the live catalog really sells:
    // the buy page with it preselected is where that visitor was going.
    // Anything else was never a service here, and gets an honest 404.
    if (PRE_REBUILD_SERVICE_SLUGS.has(slug)) permanentRedirect(`/buy?service=${slug}`);
    const listed = await getServiceMeta(slug).catch(() => null);
    if (listed) permanentRedirect(`/buy?service=${slug}`);
    notFound();
  }

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
    <>
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

      <PageHero
        crumbs={[{ label: "Services", href: "/services" }, { label: content.name }]}
        eyebrow={`${content.name} guide`}
        title={`${content.name} virtual number for SMS verification`}
        description={content.useCase}
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button href={`/buy?service=${slug}`} variant="accent" size="lg">
            Buy a {content.name} number
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Link href="/how-it-works" className="text-sm font-medium text-forest hover:underline">
            How it works
          </Link>
        </div>
      </PageHero>

      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          {!status.connected ? (
            <UnavailableNotice message={status.message} className="mb-8" />
          ) : !currentlyListed ? (
            <div className="mb-8 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
              {content.name} is not currently listed for sale. Check back, or
              browse the full{" "}
              <Link href="/services" className="underline">
                live catalog
              </Link>
              .
            </div>
          ) : null}

          <section className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)] sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint-soft text-forest">
                <ListChecks className="h-[18px] w-[18px]" />
              </span>
              <h2 className="text-lg font-semibold tracking-tight">How it works for {content.name}</h2>
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{content.howItWorks}</p>
          </section>

          {currentlyListed && topCountries.length > 0 ? (
            <section className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Available countries right now</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Prices and stock change constantly; this reflects what is
                    actually available at this moment.
                  </p>
                </div>
                <Link
                  href={`/buy?service=${slug}`}
                  className="text-sm font-medium text-forest underline-offset-4 hover:underline"
                >
                  See every country
                </Link>
              </div>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {topCountries.map((country) => (
                  <li
                    key={country.slug}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-subtle)]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className="text-lg leading-none">{country.flag}</span>
                      <span className="truncate text-sm font-medium">{country.name}</span>
                      {country.recommended ? (
                        <span className="shrink-0 rounded-full bg-mint-soft px-2 py-0.5 text-[11px] font-medium text-forest">
                          Recommended
                        </span>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(country.priceKobo, currency.code)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint-soft text-forest">
                  <Tag className="h-[18px] w-[18px]" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">Pricing</h2>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                {content.name} numbers are priced per country and paid from
                your Xencodes wallet balance. See{" "}
                <Link href="/pricing" className="text-forest underline-offset-4 hover:underline">
                  how pricing works
                </Link>{" "}
                for what sets the exact figure. Xencodes never promises
                guaranteed delivery or a specific delivery percentage for any
                country.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-mint-soft text-forest">
                  <Info className="h-[18px] w-[18px]" />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">Good to know</h2>
              </div>
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted-foreground marker:text-mint">
                {content.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </section>
          </div>

          <CtaBand
            title={`Get a ${content.name} number`}
            body="See live availability and pick your country."
            href={`/buy?service=${slug}`}
            label="Buy a number"
          />
        </div>
      </Container>
    </>
  );
}
