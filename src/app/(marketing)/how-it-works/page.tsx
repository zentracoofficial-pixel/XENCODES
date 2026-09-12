import type { Metadata } from "next";
import {
  ArrowRight,
  Banknote,
  Check,
  Clock,
  Copy,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  UserPlus,
  XCircle,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "The complete Xencodes customer journey: register, fund your wallet, select a service and country, purchase a number, and receive your SMS code.",
};

const mainSteps = [
  {
    icon: UserPlus,
    title: "Register",
    description: "Create a free Xencodes account in under a minute.",
  },
  {
    icon: Banknote,
    title: "Fund wallet",
    description: "Deposit funds using your preferred payment method.",
  },
  {
    icon: Smartphone,
    title: "Select service",
    description: "Choose the platform you need to verify.",
  },
  {
    icon: ShieldCheck,
    title: "Select country",
    description: "Pick a country based on live availability and price.",
  },
  {
    icon: Check,
    title: "View availability",
    description: "Confirm live status before purchasing.",
  },
  {
    icon: Smartphone,
    title: "Purchase number",
    description: "Buy the number instantly from your wallet balance.",
  },
  {
    icon: MessageSquareText,
    title: "Receive SMS",
    description: "The code lands in your dashboard inbox in real time.",
  },
  {
    icon: Copy,
    title: "Copy code",
    description: "Copy the verification code with one click.",
  },
  {
    icon: Check,
    title: "Activation completed",
    description: "Enter the code on the target service to finish verifying.",
  },
];

const fallbackSteps = [
  {
    icon: Clock,
    title: "Wait",
    description: "Give the SMS a short window to arrive — most codes land within seconds.",
  },
  {
    icon: RefreshCcw,
    title: "Retry where permitted",
    description: "Some services allow requesting a second code on the same number.",
  },
  {
    icon: XCircle,
    title: "Cancel or expire",
    description: "If no code arrives in time, the activation is cancelled or expires automatically.",
  },
  {
    icon: Banknote,
    title: "Automatic refund",
    description: "Eligible failed activations are refunded to your wallet without a support request.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="How it works"
            title="The complete Xencodes journey"
            description="Register, fund your wallet, and complete your first verification in minutes — the whole flow is designed to stay fast and obvious."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/register" size="lg">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {mainSteps.map((step, index) => (
              <Card key={step.title} className="relative p-6">
                <span className="absolute right-5 top-5 text-2xl font-semibold text-border">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <step.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-semibold">{step.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="If something goes wrong"
            title="What happens if the SMS doesn't arrive"
            description="Verification isn't always instant. Here's the fallback path Xencodes follows automatically."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {fallbackSteps.map((step, index) => (
              <div key={step.title} className="flex flex-col items-start">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <step.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-semibold">
                  {index + 1}. {step.title}
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
