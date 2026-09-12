import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiPlans } from "@/data/pricing";

export const metadata: Metadata = {
  title: "API Pricing",
  description:
    "Developer and business pricing for the Xencodes API, from pay-as-you-go to enterprise plans.",
};

export default function ApiPricingPage() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="API Pricing"
          title="Plans that scale with your usage"
          description="Start free with pay-as-you-go wallet billing, then upgrade for higher throughput and priority delivery."
          align="center"
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {apiPlans.map((plan) => (
            <Card
              key={plan.name}
              className={cn(
                "p-8",
                plan.highlighted && "border-primary shadow-lg shadow-primary/10",
              )}
            >
              {plan.highlighted ? (
                <p className="mb-3 inline-flex rounded-full bg-primary-muted px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Most popular
                </p>
              ) : null}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {plan.priceLabel}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {plan.description}
              </p>
              <ul className="mt-6 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                href="/register"
                variant={plan.highlighted ? "primary" : "outline"}
                className="mt-8 w-full"
              >
                {plan.monthlyFee === null ? "Contact sales" : "Get started"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
