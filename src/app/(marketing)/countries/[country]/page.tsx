import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Globe2, Hash, PackageCheck } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AvailabilityBadge, AvailabilityDot } from "@/components/marketing/availability-badge";
import { countries, getCountryBySlug } from "@/data/countries";
import { getAvailabilityForCountry } from "@/data/services";

export function generateStaticParams() {
  return countries.map((country) => ({ country: country.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}): Promise<Metadata> {
  const { country: slug } = await params;
  const country = getCountryBySlug(slug);
  if (!country) return {};
  return {
    title: `Virtual Numbers in ${country.name}`,
    description: `Buy a virtual number in ${country.name} for SMS verification through Xencodes.`,
  };
}

export default async function CountryDetailPage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country: slug } = await params;
  const country = getCountryBySlug(slug);
  if (!country) notFound();

  const availableServices = getAvailabilityForCountry(country.slug);

  return (
    <>
      <Section>
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <span className="text-4xl leading-none">{country.flag}</span>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                    Virtual numbers in {country.name}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dial code {country.dialCode}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-lg text-muted-foreground text-balance">
                Purchase a {country.name} virtual number for SMS verification
                across {country.serviceCount} supported services, with
                {country.numberTypes.includes("rental")
                  ? " both activation and rental options."
                  : " activation numbers."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button href="/register" size="lg">
                  Buy a number in {country.name}
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button href="/services" variant="outline" size="lg">
                  Browse services
                </Button>
              </div>
            </div>

            <Card className="w-full max-w-sm shrink-0 p-6">
              <p className="text-sm text-muted-foreground">Starting from</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                ${country.priceFrom.toFixed(2)}
              </p>
              <ul className="mt-5 space-y-3 text-sm">
                <li className="flex items-center gap-2.5">
                  <Globe2 className="h-4 w-4 text-muted-foreground" />
                  Overall availability: <AvailabilityBadge status={country.availability} />
                </li>
                <li className="flex items-center gap-2.5">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  {country.serviceCount} services currently supported
                </li>
                <li className="flex items-center gap-2.5">
                  <PackageCheck className="h-4 w-4 text-muted-foreground" />
                  {country.numberTypes.includes("rental")
                    ? "Activation and rental numbers"
                    : "Activation numbers only"}
                </li>
              </ul>
            </Card>
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <h2 className="text-xl font-semibold">
            Services available in {country.name}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Live status reflects current carrier and inventory conditions and
            can change at any time.
          </p>
          <Card className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                  <th className="px-5 py-3 font-medium">Avg. delivery</th>
                </tr>
              </thead>
              <tbody>
                {availableServices.map(({ service, availability }) => (
                  <tr key={service.slug} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5 font-medium">{service.name}</td>
                    <td className="px-5 py-3.5">
                      <AvailabilityDot status={availability!.status} />
                    </td>
                    <td className="px-5 py-3.5">${availability!.price.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      ~{availability!.avgDeliverySeconds}s
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
