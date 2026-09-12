import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { faqs } from "@/data/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about Xencodes virtual numbers and SMS verification.",
};

export default function FaqPage() {
  return (
    <Section>
      <Container>
        <SectionHeading eyebrow="FAQ" title="Frequently asked questions" align="center" />
        <div className="mx-auto mt-12 max-w-2xl">
          <FaqAccordion items={faqs} />
        </div>
      </Container>
    </Section>
  );
}
