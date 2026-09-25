import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { UnavailableNotice } from "@/components/product/unavailable-notice";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { getInventoryStatus, countServices } from "@/lib/inventory";
import { formatMoney } from "@/lib/currency";
import { getVisitorCurrency } from "@/lib/currency-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Pay as you go pricing for virtual numbers, in your own currency. You pay per number, the price depends on the service and country, and no code means no charge.",
  alternates: { canonical: "/pricing" },
};

const FACTORS = [
  {
    title: "The service",
    body: "Some services are harder to verify than others, so their numbers cost more.",
  },
  {
    title: "The country",
    body: "Local carrier rates differ, so the same service costs a different amount in each country.",
  },
  {
    title: "Availability",
    body: "When a country runs low on numbers for a service, its price reflects that.",
  },
];

/**
 * How pricing works, not a price list.
 *
 * Deliberately quotes no figures. A number's price depends on the exact
 * service and country pair, and it is resolved live at the moment of
 * purchase. Any figure printed here would be a second, staler answer to a
 * question the buy page already answers correctly.
 */
export default async function PricingPage() {
  const [status, serviceCount, visitorCurrency] = await Promise.all([
    getInventoryStatus(),
    countServices().catch(() => 0),
    getVisitorCurrency(),
  ]);

  return (
    <Container className="py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Pricing" }]} />
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Simple pay as you go pricing
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
          No plans and no subscription. You add funds to your wallet, then pay
          per number. The price depends on the service and the country, and you
          always see the exact figure before you buy.
        </p>
      </div>

      {status.connected ? null : (
        <UnavailableNotice message={status.message} className="mt-5 max-w-xl" />
      )}

      <div className="mt-8">
        <h2 className="text-xl font-semibold tracking-tight">
          What sets the price
        </h2>
        <dl className="mt-4 grid gap-2.5 sm:grid-cols-3">
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
          <h2 className="font-medium">Top up what you want</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {visitorCurrency.fundingProvider
              ? `There are no fixed funding packages. Add any amount from ${formatMoney(visitorCurrency.minTopUpMinor, visitorCurrency.code)} and spend it a number at a time.`
              : `Xencodes prices in ${visitorCurrency.code} for accounts outside Nigeria; funding is not connected for ${visitorCurrency.code} yet, so you can browse and see prices ahead of it going live.`}
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-forest px-6 py-7 sm:px-8">
        <div>
          <h2 className="text-lg font-semibold text-white">
            See the price for your service
          </h2>
          <p className="mt-1 text-sm text-white/70">
            {serviceCount > 0
              ? `Search ${serviceCount.toLocaleString("en-US")} services and pick a country.`
              : "Search for your service and pick a country."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button href="/buy" variant="accent">
            Get a Number
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Looking for the full list of services?{" "}
        <Link
          href="/services"
          className="text-forest underline-offset-4 hover:underline"
        >
          Browse services
        </Link>
        , or read{" "}
        <Link href="/faq" className="text-forest underline-offset-4 hover:underline">
          frequently asked questions
        </Link>{" "}
        about refunds and payments.
      </p>
    </Container>
  );
}
