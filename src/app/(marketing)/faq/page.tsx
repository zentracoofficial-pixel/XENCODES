import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { JsonLd } from "@/components/seo/json-ld";
import { faqs } from "@/data/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "How Xencodes works, how long codes take to arrive, what happens when no code comes, how refunds work, and which services and countries are supported.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <Container className="py-10 sm:py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }}
      />

      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Questions
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Everything worth knowing before you buy your first number.
        </p>

        <div className="mt-6">
          <FaqAccordion items={faqs} defaultOpen={0} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4">
          <p className="text-sm text-muted-foreground">
            Still need a hand? Support is in your dashboard.
          </p>
          <Button href="/buy" size="sm">
            Get a Number
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Container>
  );
}
