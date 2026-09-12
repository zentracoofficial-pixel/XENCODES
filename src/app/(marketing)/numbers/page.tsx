import type { Metadata } from "next";
import { ArrowRight, CalendarClock, Repeat, Timer } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AvailabilityDot } from "@/components/marketing/availability-badge";
import { countries } from "@/data/countries";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Virtual Numbers",
  description:
    "Explore Xencodes virtual phone numbers: short activation sessions and longer-term rentals across multiple countries.",
};

const numberTypes = [
  {
    icon: Timer,
    title: "Activation numbers",
    description:
      "A single-use number assigned for one verification session. Ideal when you only need one SMS code for one account.",
    points: [
      "Fastest and most affordable option",
      "Number is released once the session ends",
      "Best for one-time sign-up or login verification",
    ],
  },
  {
    icon: CalendarClock,
    title: "Rental numbers",
    description:
      "Reserve a number for a defined period so it can receive multiple messages over time, not just one code.",
    points: [
      "Available in 1, 7, 14, and 30 day durations",
      "Useful for recurring verification or account monitoring",
      "Number stays assigned to you for the full term",
    ],
  },
  {
    icon: Repeat,
    title: "Continuously expanding catalog",
    description:
      "New countries, providers, and services are added regularly as inventory and demand grow.",
    points: [
      "Multiple number providers per country",
      "Automatic routing to the best available inventory",
      "Availability reflects real-time carrier conditions",
    ],
  },
];

const previewRows = [
  { countrySlug: "usa", serviceSlug: "telegram" },
  { countrySlug: "uk", serviceSlug: "instagram" },
  { countrySlug: "canada", serviceSlug: "discord" },
  { countrySlug: "germany", serviceSlug: "linkedin" },
  { countrySlug: "poland", serviceSlug: "upwork" },
  { countrySlug: "nigeria", serviceSlug: "whatsapp" },
];

export default function NumbersPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Virtual Numbers"
            title="Numbers built for verification, not for talking"
            description="Every Xencodes number is provisioned specifically to receive SMS verification codes — pick a short activation for a single code, or a rental when you need a number to stay active longer."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/register" size="lg">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/pricing" variant="outline" size="lg">
              View pricing
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <div className="grid gap-6 lg:grid-cols-3">
            {numberTypes.map((type) => (
              <Card key={type.title} className="p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <type.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{type.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {type.description}
                </p>
                <ul className="mt-4 space-y-2">
                  {type.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                      {point}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading
            eyebrow="Live snapshot"
            title="A sample of currently available numbers"
            description="Availability changes continuously. Sign in to see live, real-time inventory for every country and service combination."
          />
          <Card className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map(({ countrySlug, serviceSlug }) => {
                  const country = countries.find((c) => c.slug === countrySlug);
                  const service = services.find((s) => s.slug === serviceSlug);
                  const availability = service?.availability.find(
                    (a) => a.countrySlug === countrySlug,
                  );
                  if (!country || !service || !availability) return null;
                  return (
                    <tr
                      key={`${countrySlug}-${serviceSlug}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-3.5 font-medium">
                        {country.flag} {country.name}
                      </td>
                      <td className="px-5 py-3.5">{service.name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {country.numberTypes.includes("rental") && service.rentalSupported
                          ? "Activation / Rental"
                          : "Activation"}
                      </td>
                      <td className="px-5 py-3.5">
                        <AvailabilityDot status={availability.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        {availability.status === "unavailable"
                          ? "—"
                          : `$${availability.price.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <p className="mt-4 text-sm text-muted-foreground">
            Xencodes never guarantees that every number works with every
            service. Availability depends on country, provider, carrier, and
            current inventory.
          </p>
        </Container>
      </Section>
    </>
  );
}
