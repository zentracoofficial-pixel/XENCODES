import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { ServicesDirectory } from "@/components/marketing/services-directory";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Services",
  description: "Search supported verification services and get a number in seconds.",
};

export default function ServicesPage() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Services"
          title="Find your service"
          description="Search for a service, then get a number in seconds."
        />
        <div className="mt-10">
          <ServicesDirectory services={services} />
        </div>
      </Container>
    </Section>
  );
}
