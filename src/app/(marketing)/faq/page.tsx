import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { PageHero } from "@/components/marketing/page-hero";
import { CtaBand } from "@/components/marketing/cta-band";
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
    <>
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

      <PageHero
        crumbs={[{ label: "FAQ" }]}
        eyebrow="FAQ"
        title="Questions, answered"
        description="Everything worth knowing before you buy your first number: delivery, refunds, payments and supported services."
      />

      <Container className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <FaqAccordion items={faqs} defaultOpen={0} />

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4 shadow-[var(--shadow-subtle)]">
            <p className="text-sm text-muted-foreground">
              Still need a hand? Support is in your dashboard, or email us from the{" "}
              <Link href="/about#contact" className="text-forest underline-offset-4 hover:underline">
                contact details
              </Link>
              .
            </p>
            <Button href="/dashboard/support" size="sm" variant="outline">
              Open support
            </Button>
          </div>

          <CtaBand title="Ready for your number?" body="Search for your service and see live prices before you buy." />

          <p className="mt-6 text-sm text-muted-foreground">
            See the full{" "}
            <Link href="/services" className="text-forest underline-offset-4 hover:underline">
              list of services
            </Link>{" "}
            or read how{" "}
            <Link href="/pricing" className="text-forest underline-offset-4 hover:underline">
              pricing works
            </Link>
            .
          </p>
        </div>
      </Container>
    </>
  );
}
