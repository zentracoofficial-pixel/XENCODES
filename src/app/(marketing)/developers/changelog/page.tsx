import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "API Changelog",
  description: "Track updates and changes to the Xencodes API.",
};

const entries = [
  {
    date: "2026-08-18",
    tag: "Added",
    title: "Rental duration field on activations",
    description:
      "The activations endpoint now accepts a duration_days field to create rentals alongside standard activations.",
  },
  {
    date: "2026-07-02",
    tag: "Improved",
    title: "Faster webhook delivery",
    description:
      "Webhook events for incoming SMS now deliver in under 2 seconds on average.",
  },
  {
    date: "2026-05-21",
    tag: "Added",
    title: "Balance endpoint",
    description: "Introduced /v1/balance for reading wallet balance programmatically.",
  },
];

export default function ChangelogPage() {
  return (
    <Section>
      <Container>
        <SectionHeading eyebrow="Developers" title="API Changelog" />
        <div className="mt-10 space-y-5 max-w-2xl">
          {entries.map((entry) => (
            <Card key={entry.title} className="p-6">
              <div className="flex items-center gap-3">
                <Badge variant={entry.tag === "Added" ? "success" : "primary"}>
                  {entry.tag}
                </Badge>
                <span className="text-xs text-muted-foreground">{entry.date}</span>
              </div>
              <p className="mt-3 font-semibold">{entry.title}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {entry.description}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
