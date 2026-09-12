import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { ServicesDirectory } from "@/components/marketing/services-directory";
import { services } from "@/data/services";

export const metadata: Metadata = {
  title: "Supported Services — WhatsApp, Telegram, Instagram & More",
  description:
    "Every service you can verify with a Xencodes virtual number, with live availability and Naira prices. WhatsApp, Telegram, Instagram, Facebook, TikTok, Fiverr, Upwork and more.",
  keywords: [
    "WhatsApp verification number Nigeria",
    "Telegram virtual number",
    "Instagram SMS verification",
    "Fiverr phone verification Nigeria",
  ],
  alternates: { canonical: "/services" },
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
