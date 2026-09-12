import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { ServicesDirectory } from "@/components/marketing/services-directory";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Browse the full Xencodes catalog of supported verification services, including social platforms, marketplaces, and developer tools.",
};

export default function ServicesPage() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Services"
          title="Supported verification services"
          description="Only services that are actually supported and available are shown here. Availability by country is confirmed on each service page."
        />
        <div className="mt-10">
          <ServicesDirectory services={services} />
        </div>
      </Container>
    </Section>
  );
}
