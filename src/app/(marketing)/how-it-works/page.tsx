import type { Metadata } from "next";
import { ArrowRight, Check, Copy, MessageSquareText, Smartphone, ShoppingCart } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "How to Receive an SMS Verification Code Online",
  description:
    "Step by step: choose a service, pick a country, buy the number, and read your SMS verification code in your Xencodes dashboard.",
  keywords: [
    "how to receive SMS online",
    "how virtual numbers work",
    "receive OTP without SIM",
  ],
  alternates: { canonical: "/how-it-works" },
};

const steps = [
  {
    icon: Smartphone,
    title: "Choose your service",
    description: "Search and select the service you need to verify.",
  },
  {
    icon: Check,
    title: "Select a country and available number",
    description: "Pick a country based on live availability and price.",
  },
  {
    icon: ShoppingCart,
    title: "Purchase the number",
    description: "Pay from your wallet balance — instant reservation.",
  },
  {
    icon: MessageSquareText,
    title: "Wait for the SMS",
    description: "Your code arrives automatically, no refresh needed.",
  },
  {
    icon: Copy,
    title: "Copy your verification code",
    description: "Copy it with one click and finish verifying.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="How it works"
            title="Five simple steps"
            description="From choosing a service to finishing your verification, the whole process takes minutes."
            align="center"
          />
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <div className="mx-auto max-w-2xl space-y-5">
            {steps.map((step, index) => (
              <Card key={step.title} className="flex items-start gap-4 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <step.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Step {index + 1}
                  </p>
                  <p className="mt-0.5 font-semibold">{step.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Button href="/buy" size="lg">
              Get a Number
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
