import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { CountriesDirectory } from "@/components/marketing/countries-directory";
import { countries } from "@/data/countries";

export const metadata: Metadata = {
  title: "Countries",
  description:
    "Browse the countries Xencodes supports for virtual numbers and SMS verification, with live availability and pricing.",
};

export default function CountriesPage() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Countries"
          title="Supported countries"
          description="Pricing and delivery speed vary by country based on local carrier and provider conditions."
        />
        <div className="mt-10">
          <CountriesDirectory countries={countries} />
        </div>
      </Container>
    </Section>
  );
}
