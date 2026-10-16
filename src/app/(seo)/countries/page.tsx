import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Flag } from "@/components/ui/flag";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqSection } from "@/components/seo/blocks";
import { getSeoIndex } from "@/lib/seo-catalog";
import { plural, REFUND_SENTENCE } from "@/lib/seo-copy";

// Built once and served from the cache: nothing here depends on who is looking.
export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const { countries } = await getSeoIndex();
  return {
    title: `Virtual Phone Numbers by Country${countries.length ? `: ${countries.length}+ Countries` : ""}`,
    description:
      "Receive SMS verification codes on virtual phone numbers from countries around the world. Choose a country, see live prices, and pay only for numbers that receive their code.",
    alternates: { canonical: "/countries" },
  };
}

export default async function CountriesPage() {
  const { countries } = await getSeoIndex();
  const letters = [...new Set(countries.map((country) => country.name.charAt(0).toUpperCase()))].sort();

  return (
    <>
      <PageHero
        crumbs={[{ label: "Countries" }]}
        eyebrow="Worldwide"
        title="Virtual phone numbers by country"
        description={`${countries.length ? `${plural(countries.length, "country", "countries")} have` : "Countries have"} numbers on sale for receiving SMS verification codes. Pick a country to see which services it works for and what it costs.`}
      />
      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          {countries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Countries appear here as soon as numbers are back on sale.
            </p>
          ) : (
            <>
              <nav aria-label="Jump to letter" className="mb-6 flex flex-wrap gap-1.5">
                {letters.map((letter) => (
                  <a
                    key={letter}
                    href={`#letter-${letter}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-sm font-medium hover:border-mint hover:bg-mint-soft"
                  >
                    {letter}
                  </a>
                ))}
              </nav>
              {letters.map((letter) => (
                <section key={letter} id={`letter-${letter}`} className="mb-8 scroll-mt-24">
                  <h2 className="text-lg font-semibold tracking-tight">{letter}</h2>
                  <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {countries
                      .filter((country) => country.name.charAt(0).toUpperCase() === letter)
                      .map((country) => (
                        <li key={country.slug} className="min-w-0">
                          <Link
                            href={`/countries/${country.slug}`}
                            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 transition-colors hover:border-mint/50 hover:bg-mint-soft/40"
                          >
                            <Flag flag={country.flag} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{country.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {country.dialCode} · {plural(country.serviceCount, "service")}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </>
          )}

          <FaqSection
            items={[
              {
                question: "Do I need to be in the country to use its number?",
                answer:
                  "No. The number only has to receive a text message, so it works from anywhere in the world. The service you are verifying decides which numbers it accepts.",
              },
              {
                question: "Which country should I choose?",
                answer:
                  "Any country with the service in stock will do, and prices differ by country. If a service refuses a number, a number from another country is often the quickest fix.",
              },
              { question: "What if no code arrives?", answer: REFUND_SENTENCE },
            ]}
          />
          <CtaBand title="Pick a country and get a number" body="See live prices for every service." />
        </div>
      </Container>
    </>
  );
}
