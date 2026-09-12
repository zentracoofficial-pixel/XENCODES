import type { Metadata } from "next";
import { ArrowRight, Banknote, Globe2, MessageSquareText, Smartphone, Wallet, Webhook } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "API Features",
  description:
    "Explore Xencodes API capabilities: number availability, activation management, SMS retrieval, balances, and webhooks.",
};

const features = [
  {
    icon: Globe2,
    title: "Countries & services",
    description:
      "List every supported country and service, including live status so your integration reflects real availability, not a static catalog.",
  },
  {
    icon: Banknote,
    title: "Pricing",
    description:
      "Fetch current pricing for any country and service combination before initiating a purchase.",
  },
  {
    icon: Smartphone,
    title: "Activations",
    description:
      "Create, retrieve, and cancel activations programmatically, including both short activations and longer rentals.",
  },
  {
    icon: MessageSquareText,
    title: "SMS retrieval",
    description:
      "Poll for incoming messages or receive them instantly with webhooks, including the parsed verification code.",
  },
  {
    icon: Wallet,
    title: "Balance",
    description:
      "Check wallet balance and transaction history directly from your integration.",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    description:
      "Subscribe to activation lifecycle events — created, SMS received, completed, expired, and refunded.",
  },
];

export default function ApiFeaturesPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="API Features"
            title="Everything the dashboard can do, programmatically"
            description="The Xencodes API exposes the same core capabilities as the customer dashboard, built for automation."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/developers/docs" size="lg">
              Read the docs
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <feature.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-semibold">{feature.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
