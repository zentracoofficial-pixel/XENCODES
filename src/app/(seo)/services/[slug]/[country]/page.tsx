import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/ui/flag";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqSection, LinkGrid, StatRow, Steps } from "@/components/seo/blocks";
import { getSeoMoney } from "@/lib/seo-catalog";
import { isIndexedPair, loadSeoCountry, loadSeoService } from "@/lib/seo-pages";
import { pairFaqs, plural, REFUND_SENTENCE } from "@/lib/seo-copy";
import { SITE_URL, ORGANIZATION_REF } from "@/lib/site";

// Built once and served from the cache: nothing here depends on who is looking.
export const dynamic = "force-static";
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

async function load(slug: string, countrySlug: string) {
  const { offers } = await loadSeoService(slug);
  const country = offers?.countries.find((entry) => entry.slug === countrySlug) ?? null;
  return { offers, country };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; country: string }> }): Promise<Metadata> {
  const { slug, country: countrySlug } = await params;
  const { offers, country } = await load(slug, countrySlug);
  if (!offers || !country) return {};
  const money = await getSeoMoney();
  const from = money(country.fromPriceKobo).usd;
  const indexed = await isIndexedPair(slug, countrySlug);
  const name = offers.service.name;

  return {
    title: `${name} Number for ${country.name} (${country.dialCode})`,
    description: `Buy a ${country.name} virtual number (${country.dialCode}) to receive your ${name} verification code, from ${from}. Pay per number and get an automatic refund if no code arrives.`,
    alternates: { canonical: `/services/${slug}/${countrySlug}` },
    robots: indexed ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function ServiceInCountryPage({ params }: { params: Promise<{ slug: string; country: string }> }) {
  const { slug, country: countrySlug } = await params;
  // A repeat listing ("usa-2") is the same place as the plain one.
  const plainSlug = countrySlug.replace(/-\d+$/, "");
  if (plainSlug !== countrySlug) permanentRedirect(`/services/${slug}/${plainSlug}`);

  const { offers, country } = await load(slug, countrySlug);
  if (!offers || !country) notFound();

  const name = offers.service.name;
  const money = await getSeoMoney();
  const price = money(country.fromPriceKobo);

  const countryData = await loadSeoCountry(countrySlug);
  const sameCountry = (countryData?.offers.services ?? [])
    .filter((service) => service.slug !== slug)
    .sort((a, b) => Number(b.popular) - Number(a.popular) || a.fromPriceKobo - b.fromPriceKobo)
    .slice(0, 8);
  const sameService = offers.countries.filter((entry) => entry.slug !== countrySlug).slice(0, 8);
  const faqs = pairFaqs({ service: name, country: country.name, dialCode: country.dialCode, fromUsd: price.usd, nationalDigits: country.nationalDigits });

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${SITE_URL}/services/${slug}/${countrySlug}#service`,
          name: `${name} SMS verification number, ${country.name}`,
          serviceType: "Virtual phone number for receiving SMS verification codes",
          provider: ORGANIZATION_REF,
          url: `${SITE_URL}/services/${slug}/${countrySlug}`,
          areaServed: country.name,
          ...(price.usdNumber != null
            ? { offers: { "@type": "Offer", priceCurrency: "USD", price: price.usdNumber, availability: "https://schema.org/InStock" } }
            : {}),
        }}
      />

      <PageHero
        crumbs={[
          { label: "Services", href: "/services" },
          { label: name, href: `/services/${slug}` },
          { label: country.name },
        ]}
        eyebrow={`${name} · ${country.name}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Flag flag={country.flag} className="!h-7 !w-10" />
            <span>
              {country.name} number for {name}
            </span>
          </span>
        }
        description={`Receive your ${name} verification code on a ${country.name} (${country.dialCode}) virtual number, from ${price.usd}. ${REFUND_SENTENCE}`}
      >
        <Button href={`/buy?service=${slug}&country=${countrySlug}`} variant="accent" size="lg">
          Buy a {country.name} number
          <ArrowRight className="h-4 w-4" />
        </Button>
      </PageHero>

      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <StatRow
            items={[
              { label: "Price from", value: `${price.usd} (${price.ngn})` },
              { label: "Country code", value: country.dialCode || "On the buy page" },
              { label: "Availability", value: country.stockCount ? `${country.stockCount.toLocaleString("en-US")} in stock` : "In stock now" },
            ]}
          />

          <div className="mt-10 grid gap-4">
            <Steps
              title={`How to get a ${country.name} number for ${name}`}
              steps={[
                { title: "Choose the number", body: `Pick ${name} and ${country.name} on the buy page. The exact price is confirmed before anything is charged.` },
                { title: "Enter it in " + name, body: `Type the number exactly as shown, including ${country.dialCode || "the country code"}, where ${name} asks for a phone number, then request the code.` },
                { title: "Read the code", body: `The code appears on your activation page the moment ${name} sends it. ${REFUND_SENTENCE}` },
              ]}
            />
            <section className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-subtle)]">
              <h2 className="text-lg font-semibold tracking-tight">About this {country.name} number</h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
                <p>
                  A {country.name} virtual number is a phone number with the {country.name} country code{country.dialCode ? ` (${country.dialCode})` : ""}
                  {country.nationalDigits ? `, followed by about ${country.nationalDigits} digits,` : ""} that receives text messages online. It is
                  meant for receiving the one-time code {name} sends during sign-up or login; you do not need a SIM card or to be in{" "}
                  {country.name}.
                </p>
                <p>
                  The number is yours for this one activation only. It cannot be used for calls, and it will not receive later codes, so keep the
                  account&apos;s own recovery options up to date. {name} decides which numbers it accepts; if one is refused, a number from another
                  country is often the quickest fix.
                </p>
              </div>
            </section>
          </div>

          <FaqSection items={faqs} />

          <LinkGrid
            title={`More ${name} countries`}
            intro={`${plural(offers.countries.length, "country", "countries")} have ${name} numbers on sale right now.`}
            items={sameService.map((entry) => ({
              href: `/services/${slug}/${entry.slug}`,
              label: `${name} number for ${entry.name}`,
              hint: `from ${money(entry.fromPriceKobo).usd}`,
              leading: <Flag flag={entry.flag} />,
            }))}
            moreHref={`/services/${slug}`}
            moreLabel={`All ${name} countries`}
          />

          <LinkGrid
            title={`Other services in ${country.name}`}
            items={sameCountry.map((service) => ({
              href: `/services/${service.slug}/${countrySlug}`,
              label: `${service.name} number for ${country.name}`,
              hint: `from ${money(service.fromPriceKobo).usd}`,
            }))}
            moreHref={`/countries/${countrySlug}`}
            moreLabel={`All ${country.name} numbers`}
          />

          <p className="mt-8 text-xs text-muted-foreground">
            Prices are the lowest current price and move with supply. See{" "}
            <Link href="/pricing" className="underline underline-offset-4">
              how pricing works
            </Link>
            .
          </p>

          <CtaBand title={`Get a ${country.name} number for ${name}`} body="See the exact price and buy in a few clicks." href={`/buy?service=${slug}&country=${countrySlug}`} label="Buy a number" />
        </div>
      </Container>
    </>
  );
}
