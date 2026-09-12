import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Code2,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { InboxPreview } from "@/components/marketing/inbox-preview";
import { ServiceChip } from "@/components/marketing/service-chip";
import { CountryCard } from "@/components/marketing/country-card";
import { AvailabilityDot } from "@/components/marketing/availability-badge";
import { services, getServiceBySlug } from "@/data/services";
import { countries } from "@/data/countries";

const steps = [
  {
    icon: Smartphone,
    title: "Select service",
    description: "Choose the platform you need to verify, from social apps to marketplaces.",
  },
  {
    icon: ShieldCheck,
    title: "Select country",
    description: "Pick a supported country based on live availability and pricing.",
  },
  {
    icon: Banknote,
    title: "Purchase number",
    description: "Buy an available number instantly using your wallet balance.",
  },
  {
    icon: MessageSquareText,
    title: "Receive SMS",
    description: "Watch the code land in your real-time dashboard inbox, ready to copy.",
  },
];

const highlightedServiceSlugs = [
  "facebook",
  "instagram",
  "telegram",
  "whatsapp",
  "tiktok",
  "google",
  "fiverr",
  "upwork",
  "discord",
  "linkedin",
];

const sampleAvailability = [
  { serviceSlug: "telegram", countrySlug: "usa" },
  { serviceSlug: "instagram", countrySlug: "uk" },
  { serviceSlug: "whatsapp", countrySlug: "nigeria" },
  { serviceSlug: "google", countrySlug: "germany" },
  { serviceSlug: "tiktok", countrySlug: "philippines" },
];

export default function HomePage() {
  const totalAvailability = services.flatMap((s) => s.availability);
  const activeEntries = totalAvailability.filter((a) => a.status !== "unavailable");
  const avgSuccessRate = Math.round(
    activeEntries.reduce((sum, a) => sum + a.successRate, 0) / activeEntries.length,
  );
  const avgDelivery = Math.round(
    activeEntries.reduce((sum, a) => sum + a.avgDeliverySeconds, 0) / activeEntries.length,
  );

  return (
    <>
      <div className="relative overflow-hidden border-b border-border bg-grid [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_40%,transparent_100%)]">
        <Container className="relative pt-24 pb-20 sm:pt-32 sm:pb-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-8">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {countries.length} countries &middot; {services.length}+ services live
              </span>
              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold tracking-tight leading-[1.1] text-balance">
                Virtual numbers.
                <br /> Real-time SMS verification.
              </h1>
              <p className="mt-5 max-w-lg text-lg text-muted-foreground text-balance">
                Xencodes gives developers and teams instant access to virtual
                phone numbers for legitimate account verification and testing
                — with live availability, transparent pricing, and codes
                delivered to your dashboard in seconds.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button href="/register" size="lg">
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button href="/how-it-works" variant="outline" size="lg">
                  See how it works
                </Button>
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                For legitimate verification and testing only. Not for fraud,
                impersonation, or bypassing platform security controls.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <InboxPreview />
            </div>
          </div>
        </Container>
      </div>

      <Section className="py-12 sm:py-16">
        <Container>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Countries" value={countries.length} />
            <StatCard label="Supported services" value={`${services.length}+`} />
            <StatCard label="Avg. delivery time" value={`${avgDelivery}s`} />
            <StatCard label="Avg. success rate" value={`${avgSuccessRate}%`} />
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="How it works"
            title="From service to code in four steps"
            description="The core Xencodes flow is designed to stay fast and obvious, always within a click or two."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <Card key={step.title} className="relative p-6">
                <span className="absolute right-5 top-5 text-3xl font-semibold text-border">
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

      <Section className="bg-secondary/30">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Services"
              title="A growing catalog of supported services"
              description="Social platforms, marketplaces, developer tools, and more — with new services added continuously."
            />
            <Button href="/services" variant="outline">
              View all services
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {highlightedServiceSlugs.map((slug) => {
              const service = getServiceBySlug(slug);
              if (!service) return null;
              return <ServiceChip key={slug} service={service} />;
            })}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Countries"
              title="Choose from multiple countries"
              description="Availability, pricing, and delivery speed vary by country based on live carrier and inventory conditions."
            />
            <Button href="/countries" variant="outline">
              View all countries
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {countries.slice(0, 4).map((country) => (
              <CountryCard key={country.slug} country={country} />
            ))}
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <SectionHeading
            eyebrow="Reliability"
            title="Live availability, never a false promise"
            description="Xencodes never guarantees that every number works with every service. Availability depends on country, provider, carrier, and current inventory — shown live before you buy."
          />
          <Card className="mt-10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                  <th className="px-5 py-3 font-medium">Avg. delivery</th>
                </tr>
              </thead>
              <tbody>
                {sampleAvailability.map(({ serviceSlug, countrySlug }) => {
                  const service = getServiceBySlug(serviceSlug);
                  const country = countries.find((c) => c.slug === countrySlug);
                  const availability = service?.availability.find(
                    (a) => a.countrySlug === countrySlug,
                  );
                  if (!service || !country || !availability) return null;
                  return (
                    <tr
                      key={`${serviceSlug}-${countrySlug}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-3.5 font-medium">{service.name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {country.flag} {country.name}
                      </td>
                      <td className="px-5 py-3.5">
                        <AvailabilityDot status={availability.status} />
                      </td>
                      <td className="px-5 py-3.5">${availability.price.toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        ~{availability.avgDeliverySeconds}s
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-muted text-primary">
                <CalendarClock className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">Number rentals</h3>
              <p className="mt-2 text-muted-foreground">
                Need more than one code? Rent a number for a defined period —
                7, 14, or 30 days — instead of running separate short
                activations.
              </p>
              <Button href="/pricing" variant="outline" className="mt-6">
                See rental pricing
              </Button>
            </Card>
            <Card className="p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-muted text-primary">
                <Code2 className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">Developer API</h3>
              <p className="mt-2 text-muted-foreground">
                Automate number purchases, poll or receive webhooks for
                incoming SMS, and manage activations programmatically.
              </p>
              <Button href="/api" variant="outline" className="mt-6">
                Explore the API
              </Button>
            </Card>
          </div>
        </Container>
      </Section>

      <Section className="pb-24 sm:pb-32">
        <Container>
          <Card className="flex flex-col items-center gap-6 bg-primary px-8 py-14 text-center text-primary-foreground sm:px-16">
            <Zap className="h-8 w-8" />
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
              Ready to verify your first number?
            </h2>
            <p className="max-w-lg text-primary-foreground/80">
              Create a free account, fund your wallet, and complete your
              first activation in minutes.
            </p>
            <Button
              href="/register"
              size="lg"
              className="bg-primary-foreground text-primary hover:opacity-90"
            >
              Create free account
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>
        </Container>
      </Section>
    </>
  );
}

