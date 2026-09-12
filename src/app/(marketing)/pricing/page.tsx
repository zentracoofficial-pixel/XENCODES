import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { DevelopmentDataNotice } from "@/components/product/development-notice";
import { getCatalog } from "@/lib/catalog";
import { formatNairaFromNaira } from "@/lib/currency";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Pay as you go pricing for virtual numbers in Naira. You pay per number, the price depends on the service and country, and no code means no charge.",
  alternates: { canonical: "/pricing" },
};

const FACTORS = [
  {
    title: "The service",
    body: "Some services are harder to verify than others, so their numbers cost more.",
  },
  {
    title: "The country",
    body: "Local carrier rates differ. Nigerian numbers are usually the cheapest option.",
  },
  {
    title: "Availability",
    body: "When a country runs low on numbers for a service, its price reflects that.",
  },
];

export default async function PricingPage() {
  const { services, countries, floorNaira, isLive } = await getCatalog();

  // Cheapest few, straight from the live catalog.
  const cheapest = [...services]
    .filter((service) => service.priceFromNaira > 0)
    .sort((a, b) => a.priceFromNaira - b.priceFromNaira)
    .slice(0, 8);

  return (
    <Container className="py-10 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Simple pay as you go pricing
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
          No plans and no subscription. You add funds to your wallet, then pay
          per number. Prices start at{" "}
          <span className="font-semibold text-foreground">
            {floorNaira > 0 ? formatNairaFromNaira(floorNaira) : "a low rate"}
          </span>{" "}
          and you always see the exact price before you buy.
        </p>
      </div>

      {!isLive ? <DevelopmentDataNotice className="mt-5 max-w-xl" /> : null}

      <dl className="mt-8 grid gap-2.5 sm:grid-cols-3">
        {FACTORS.map((factor) => (
          <div
            key={factor.title}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <dt className="font-medium">{factor.title}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {factor.body}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Current prices
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cheapest country for each service, live from the catalog.
            </p>
          </div>
          <Link
            href="/services"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-forest hover:underline"
          >
            All {services.length} services
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Cheapest country
                </th>
                <th className="px-4 py-3 text-right font-medium">From</th>
              </tr>
            </thead>
            <tbody>
              {cheapest.map((service) => (
                <tr
                  key={service.slug}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/buy?service=${service.slug}`}
                      className="flex items-center gap-3 font-medium hover:text-forest"
                    >
                      <ServiceLogo
                        slug={service.slug}
                        name={service.name}
                        color={service.color}
                        size="sm"
                      />
                      {service.name}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    <span aria-hidden>{service.offers[0]?.flag}</span>{" "}
                    {service.offers[0]?.countryName}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatNairaFromNaira(service.priceFromNaira)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10 grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-medium">No code, no charge</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            If no code reaches your number before the session ends, the full
            amount goes back to your wallet automatically. You can also cancel
            early for the same refund.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-medium">{countries.length} countries</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Each service shows only the countries that can receive its codes
            right now, with the price and typical delivery time for each.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-forest px-6 py-7 sm:px-8">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Ready for your number?
          </h2>
          <p className="mt-1 text-sm text-white/70">
            Search for your service and get started.
          </p>
        </div>
        <Button href="/buy" variant="accent">
          Get a Number
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Container>
  );
}
