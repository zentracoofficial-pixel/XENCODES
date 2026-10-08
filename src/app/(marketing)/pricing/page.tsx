import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Globe2, Gauge, RotateCcw, Wallet } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { UnavailableNotice } from "@/components/product/unavailable-notice";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
import { getInventoryStatus, countServices } from "@/lib/inventory";
import { formatMoney } from "@/lib/currency";
import { getVisitorCurrency } from "@/lib/currency-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Pay as you go pricing for virtual numbers, in Nigerian Naira. You pay per number, the price depends on the service and country, and no code means no charge.",
  alternates: { canonical: "/pricing" },
};

const FACTORS = [
  {
    icon: Boxes,
    title: "The service",
    body: "Some services are harder to verify than others, so their numbers cost more.",
  },
  {
    icon: Globe2,
    title: "The country",
    body: "Local carrier rates differ, so the same service costs a different amount in each country.",
  },
  {
    icon: Gauge,
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
    <>
      <PageHero
        crumbs={[{ label: "Pricing" }]}
        eyebrow="Pricing"
        title="Simple pay as you go pricing"
        description="No plans and no subscription. Add funds to your wallet, then pay per number. You always see the exact price before you buy."
      >
        <Button href="/buy" variant="accent" size="lg">
          See the price for your service
          <ArrowRight className="h-4 w-4" />
        </Button>
      </PageHero>

      <Container className="py-12 sm:py-16">
        {status.connected ? null : (
          <UnavailableNotice message={status.message} className="mb-8 max-w-xl" />
        )}

        <h2 className="text-2xl font-semibold tracking-tight">What sets the price</h2>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          A number&apos;s price depends on the exact service and country you
          pick, and it is worked out live at the moment you buy.
        </p>
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          {FACTORS.map((factor) => (
            <div
              key={factor.title}
              className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-subtle)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint-soft text-forest">
                <factor.icon className="h-5 w-5" aria-hidden />
              </span>
              <dt className="mt-4 font-semibold">{factor.title}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{factor.body}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex gap-4 rounded-xl border border-mint/40 bg-mint-soft/60 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-forest">
              <RotateCcw className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">No code, no charge</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                If no code reaches your number before the session ends, the full
                amount goes back to your wallet automatically. You can also cancel
                early for the same refund.
              </p>
            </div>
          </div>
          <div className="flex gap-4 rounded-xl border border-border bg-surface p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mint-soft text-forest">
              <Wallet className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Top up what you want</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {visitorCurrency.fundingProvider
                  ? `There are no fixed funding packages. Add any amount from ${formatMoney(visitorCurrency.minTopUpMinor, visitorCurrency.code)} and spend it a number at a time.`
                  : `Xencodes prices in ${visitorCurrency.code} for accounts outside Nigeria; funding is not connected for ${visitorCurrency.code} yet, so you can browse and see prices ahead of it going live.`}
              </p>
            </div>
          </div>
        </div>

        <CtaBand
          title="See the price for your service"
          body={
            serviceCount > 0
              ? `Search ${serviceCount.toLocaleString("en-US")} services and pick a country.`
              : "Search for your service and pick a country."
          }
        />

        <p className="mt-6 text-sm text-muted-foreground">
          Looking for the full list of services?{" "}
          <Link href="/services" className="text-forest underline-offset-4 hover:underline">
            Browse services
          </Link>
          , or read{" "}
          <Link href="/faq" className="text-forest underline-offset-4 hover:underline">
            frequently asked questions
          </Link>{" "}
          about refunds and payments.
        </p>
      </Container>
    </>
  );
}
