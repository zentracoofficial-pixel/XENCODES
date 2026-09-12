import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { faqs } from "@/data/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about Xencodes virtual numbers and SMS verification.",
};

const categories = Array.from(new Set(faqs.map((f) => f.category)));

export default function FaqPage() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="FAQ"
          title="Frequently asked questions"
          align="center"
        />
        <div className="mx-auto mt-12 max-w-2xl space-y-10">
          {categories.map((category) => (
            <div key={category}>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <FaqAccordion items={faqs.filter((f) => f.category === category)} />
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
