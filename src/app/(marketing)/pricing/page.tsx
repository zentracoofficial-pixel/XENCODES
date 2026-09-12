import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { rentalDurations, walletTopUps, pricingFactors } from "@/data/pricing";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Understand Xencodes pay-as-you-go pricing for virtual numbers, rentals, and the developer API.",
};

const sampleService = services.find((s) => s.slug === "telegram")!;

export default function PricingPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Pricing"
            title="Simple, pay-as-you-go pricing"
            description="Fund your wallet and pay only for the numbers you use. There are no subscriptions or minimum commitments for the core platform."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/register" size="lg">
              Create free account
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/services" variant="outline" size="lg">
              Browse service pricing
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <SectionHeading
            title="What affects your price"
            description="Xencodes never charges a flat rate across the board — cost reflects real, live factors."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pricingFactors.map((factor) => (
              <Card key={factor.title} className="p-6">
                <p className="font-semibold">{factor.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {factor.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            title="Number pricing"
            description="Every activation starts at the price shown live on the service or country page. Here's an example using Telegram."
          />
          <Card className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Activation price</th>
                  <th className="px-5 py-3 font-medium">Avg. delivery</th>
                </tr>
              </thead>
              <tbody>
                {sampleService.availability
                  .filter((a) => a.status !== "unavailable")
                  .map((a) => (
                    <tr key={a.countrySlug} className="border-b border-border last:border-0">
                      <td className="px-5 py-3.5 font-medium capitalize">
                        {a.countrySlug}
                      </td>
                      <td className="px-5 py-3.5">${a.price.toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        ~{a.avgDeliverySeconds}s
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-sm text-muted-foreground">
            See exact live pricing for any service or country on its own page.
          </p>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <SectionHeading
            title="Rentals"
            description="Rent a number for a longer period instead of paying per short activation. Multipliers apply to the base activation price."
          />
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {rentalDurations.map((duration) => (
              <Card key={duration.days} className="p-6 text-center">
                <p className="text-sm text-muted-foreground">{duration.label}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {duration.multiplier}x
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  base activation price
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            title="Wallet top-ups"
            description="Deposit funds into your wallet to pay for activations and rentals. Larger deposits include a small bonus balance."
          />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {walletTopUps.map((topUp) => (
              <Card key={topUp.amount} className="p-5 text-center">
                <p className="text-xl font-semibold">${topUp.amount}</p>
                {topUp.bonus > 0 ? (
                  <p className="mt-1 text-xs text-success">+${topUp.bonus} bonus</p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">no bonus</p>
                )}
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <SectionHeading
                title="Need the developer API?"
                description="API pricing follows the same wallet-based model, with optional monthly plans for higher throughput."
              />
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {["Pay-as-you-go usage billing", "Optional Business & Enterprise plans", "No hidden per-endpoint fees"].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-success" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <Button href="/api/pricing" size="lg">
              View API pricing
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
