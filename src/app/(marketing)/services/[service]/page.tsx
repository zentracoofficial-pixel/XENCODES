import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Repeat, ShieldCheck, Timer } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvailabilityDot } from "@/components/marketing/availability-badge";
import { services, getServiceBySlug, countAvailableCountries } from "@/data/services";
import { getCountryBySlug } from "@/data/countries";

export function generateStaticParams() {
  return services.map((service) => ({ service: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service: slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) return {};
  return {
    title: `${service.name} Verification`,
    description: `Buy a virtual number to receive ${service.name} SMS verification codes through Xencodes.`,
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) notFound();

  const availableCountries = service.availability
    .map((a) => ({ availability: a, country: getCountryBySlug(a.countrySlug) }))
    .filter((entry) => entry.country);

  return (
    <>
      <Section>
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
                  style={{ backgroundColor: service.color }}
                >
                  {service.name.slice(0, 1)}
                </span>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                    {service.name} verification
                  </h1>
                  <Badge variant="outline" className="mt-1.5">
                    {service.category}
                  </Badge>
                </div>
              </div>
              <p className="mt-5 text-lg text-muted-foreground text-balance">
                {service.description}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button href="/register" size="lg">
                  Buy a {service.name} number
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button href="/how-it-works" variant="outline" size="lg">
                  How it works
                </Button>
              </div>
            </div>

            <Card className="w-full max-w-sm shrink-0 p-6">
              <p className="text-sm text-muted-foreground">Starting from</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                ${service.priceFrom.toFixed(2)}
              </p>
              <ul className="mt-5 space-y-3 text-sm">
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  {countAvailableCountries(service)} countries with availability
                </li>
                <li className="flex items-center gap-2.5">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  Activation numbers supported
                </li>
                <li className="flex items-center gap-2.5">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  {service.rentalSupported
                    ? "Rentals available for this service"
                    : "Rentals not available for this service"}
                </li>
              </ul>
            </Card>
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <h2 className="text-xl font-semibold">
            Availability by country for {service.name}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Live status reflects current carrier and inventory conditions and
            can change at any time.
          </p>
          <Card className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                  <th className="px-5 py-3 font-medium">Avg. delivery</th>
                  <th className="px-5 py-3 font-medium">Success rate</th>
                </tr>
              </thead>
              <tbody>
                {availableCountries.map(({ availability, country }) => (
                  <tr key={availability.countrySlug} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5 font-medium">
                      {country!.flag} {country!.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <AvailabilityDot status={availability.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      {availability.status === "unavailable"
                        ? "—"
                        : `$${availability.price.toFixed(2)}`}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {availability.status === "unavailable"
                        ? "—"
                        : `~${availability.avgDeliverySeconds}s`}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {availability.status === "unavailable"
                        ? "—"
                        : `${availability.successRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Container>
      </Section>
    </>
  );
}
