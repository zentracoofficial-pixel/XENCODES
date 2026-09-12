import {
  ArrowRight,
  Lock,
  Sparkles,
  Wallet,
  Zap,
  ShieldCheck,
  Globe2,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { QuickSelector } from "@/components/marketing/quick-selector";
import { ServiceChip } from "@/components/marketing/service-chip";
import { services, getServiceBySlug } from "@/data/services";
import { countries } from "@/data/countries";

const trustBullets = [
  { icon: Zap, label: "Instant reservation" },
  { icon: Globe2, label: "Multiple countries" },
  { icon: Lock, label: "Private & secure" },
];

const steps = [
  {
    number: "1",
    title: "Choose a service",
    description: "Select the service you need to verify.",
  },
  {
    number: "2",
    title: "Get your number",
    description: "Choose a country and purchase an available number.",
  },
  {
    number: "3",
    title: "Receive your code",
    description: "Your SMS appears automatically — no refreshing needed.",
  },
];

const whyXencodes = [
  {
    icon: Zap,
    title: "Fast delivery",
    description: "Receive verification messages in real time.",
  },
  {
    icon: Wallet,
    title: "Simple pricing",
    description: "Pay only for what you need.",
  },
  {
    icon: Globe2,
    title: "Multiple countries",
    description: "Choose from available numbers across supported countries.",
  },
  {
    icon: Lock,
    title: "Private",
    description: "Your number is used only for your verification session.",
  },
];

const highlightedServiceSlugs = [
  "facebook",
  "instagram",
  "whatsapp",
  "telegram",
  "tiktok",
  "google",
  "fiverr",
  "upwork",
  "discord",
  "linkedin",
];

const startingPrice = Math.min(...services.map((s) => s.priceFrom));

export default function HomePage() {
  return (
    <>
      <div className="relative overflow-hidden border-b border-border bg-warm-glow">
        <Container className="relative pt-20 pb-16 sm:pt-28 sm:pb-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-10">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold tracking-tight leading-[1.1] text-balance">
                Get verification codes{" "}
                <span className="text-primary">without the wait.</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg text-muted-foreground text-balance">
                Buy a virtual number, receive your SMS code, and complete
                your verification in minutes.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button href="/buy" size="lg">
                  Get a Number
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button href="/how-it-works" variant="outline" size="lg">
                  How It Works
                </Button>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
                {trustBullets.map((item) => (
                  <span
                    key={item.label}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground"
                  >
                    <item.icon className="h-3.5 w-3.5 text-primary" />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
            <HeroVisual />
          </div>
        </Container>
      </div>

      <Section className="py-12 sm:py-16">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-xl font-semibold">
              Choose a service and country to get started
            </h2>
          </div>
          <div className="mx-auto mt-6 max-w-xl">
            <QuickSelector services={services} countries={countries} />
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <p className="text-center text-sm font-medium text-muted-foreground">
            Works with the services you already use
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {highlightedServiceSlugs.map((slug) => {
              const service = getServiceBySlug(slug);
              if (!service) return null;
              return <ServiceChip key={slug} service={service} />;
            })}
          </div>
          <p className="mt-6 text-center">
            <Button href="/services" variant="ghost" size="sm">
              Browse all services
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </p>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            title="Three steps, about a minute"
            align="center"
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((step) => (
              <Card key={step.number} className="p-6 text-center sm:text-left">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {step.number}
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

      <Section className="bg-secondary/30">
        <Container>
          <SectionHeading eyebrow="Why Xencodes" title="Built to be simple" align="center" />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {whyXencodes.map((item) => (
              <div key={item.title} className="text-center sm:text-left">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <item.icon className="h-5 w-5" />
                </span>
                <p className="mt-3 font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          <Card className="mt-10 flex flex-col items-center gap-3 border-primary/20 bg-primary-muted/40 px-8 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h3 className="text-xl font-semibold">No code, no charge</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              If your number doesn&apos;t receive a code within the session
              period, cancel it and your payment is refunded to your wallet.
            </p>
            <Button href="/refund-policy" variant="outline" className="mt-1">
              Read the refund policy
            </Button>
          </Card>
        </Container>
      </Section>

      <Section>
        <Container>
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <Sparkles className="h-7 w-7 text-primary" />
            <h2 className="text-2xl font-semibold">Simple, upfront pricing</h2>
            <p className="text-muted-foreground">
              Starting from{" "}
              <span className="font-semibold text-foreground">
                ${startingPrice.toFixed(2)}
              </span>{" "}
              per code. Price varies by service and country.
            </p>
            <Button href="/pricing" variant="outline" className="mt-1">
              See Pricing
            </Button>
          </Card>
        </Container>
      </Section>

      <Section className="pb-24 sm:pb-32">
        <Container>
          <Card className="flex flex-col items-center gap-6 bg-primary px-8 py-14 text-center text-primary-foreground sm:px-16">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
              Need a verification number?
            </h2>
            <p className="max-w-lg text-primary-foreground/80">
              Get your number and receive your code in minutes.
            </p>
            <Button
              href="/buy"
              size="lg"
              className="bg-primary-foreground text-primary hover:opacity-90"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>
        </Container>
      </Section>
    </>
  );
}
