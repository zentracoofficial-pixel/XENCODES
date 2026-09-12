import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { JsonLd } from "@/components/seo/json-ld";
import { faqs } from "@/data/faq";

export const metadata: Metadata = {
  title: "FAQ — Virtual Numbers & SMS Verification",
  description:
    "Answers on how virtual numbers work, how long codes take, what happens when no code arrives, refunds, supported services and countries.",
  alternates: { canonical: "/faq" },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};

export default function FaqPage() {
  return (
    <Section>
      <JsonLd data={faqLd} />
      <Container>
        <SectionHeading eyebrow="FAQ" title="Frequently asked questions" align="center" />
        <div className="mx-auto mt-12 max-w-2xl">
          <FaqAccordion items={faqs} />
        </div>
      </Container>
    </Section>
  );
}
