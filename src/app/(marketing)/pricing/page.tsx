import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pricingFactors, pricingExamples } from "@/data/pricing";
import { services } from "@/data/services";
import { countries } from "@/data/countries";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, pay-as-you-go pricing for Xencodes virtual numbers.",
};

export default function PricingPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Pricing"
            title="Simple, upfront pricing"
            description="Pay only for the numbers you use — no subscription. Price varies by service and country, shown before you buy."
            align="center"
          />
          <div className="mt-8 flex justify-center">
            <Button href="/buy" size="lg">
              Get a Number
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <h2 className="text-center text-lg font-semibold">Example starting prices</h2>
          <Card className="mx-auto mt-6 max-w-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {pricingExamples.map(({ serviceSlug, countrySlug }) => {
                  const service = services.find((s) => s.slug === serviceSlug);
                  const country = countries.find((c) => c.slug === countrySlug);
                  const availability = service?.availability.find(
                    (a) => a.countrySlug === countrySlug,
                  );
                  if (!service || !country || !availability) return null;
                  return (
                    <tr key={`${serviceSlug}-${countrySlug}`} className="border-b border-border last:border-0">
                      <td className="px-5 py-3.5 font-medium">{service.name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {country.flag} {country.name}
                      </td>
                      <td className="px-5 py-3.5 font-semibold">
                        ${availability.price.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            See exact live pricing for any service on the{" "}
            <a href="/services" className="text-primary hover:underline">
              services page
            </a>
            .
          </p>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading title="What affects your price" align="center" />
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {pricingFactors.map((factor) => (
              <Card key={factor.title} className="p-6 text-center">
                <p className="font-semibold">{factor.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {factor.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pb-24 sm:pb-32">
        <Container>
          <Card className="flex flex-col items-center gap-4 p-10 text-center">
            <h2 className="text-2xl font-semibold">Ready when you are</h2>
            <Button href="/buy" size="lg">
              Get a Number
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Card>
        </Container>
      </Section>
    </>
  );
}
