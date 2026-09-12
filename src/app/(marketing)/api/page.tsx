import type { Metadata } from "next";
import { ArrowRight, Code2, Webhook, Zap } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CodeBlock } from "@/components/marketing/code-block";

export const metadata: Metadata = {
  title: "Developer API",
  description:
    "Automate number purchases, SMS retrieval, and activation management with the Xencodes developer API.",
};

const sampleRequest = `curl https://api.xencodes.com/v1/activations \\
  -H "Authorization: Bearer $XENCODES_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "service": "telegram",
    "country": "usa"
  }'`;

const sampleResponse = `{
  "id": "act_8f2c1a",
  "status": "waiting_for_sms",
  "service": "telegram",
  "country": "usa",
  "phone_number": "+14155550182",
  "price": 0.40,
  "expires_at": "2026-09-12T14:32:00Z"
}`;

const highlights = [
  {
    icon: Zap,
    title: "Real-time activations",
    description: "Purchase numbers and poll or subscribe for activation status changes.",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    description: "Get notified the instant an SMS arrives instead of polling the API.",
  },
  {
    icon: Code2,
    title: "Predictable REST design",
    description: "Consistent resources for countries, services, activations, and balance.",
  },
];

export default function ApiPage() {
  return (
    <>
      <Section>
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading
                eyebrow="Developer API"
                title="Build verification into your own systems"
                description="The Xencodes API mirrors the dashboard flow — countries, services, pricing, activations, SMS retrieval, and balance — so you can automate testing and verification end to end."
              />
              <div className="mt-8 flex flex-wrap gap-3">
                <Button href="/developers/docs" size="lg">
                  Read the docs
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button href="/api/pricing" variant="outline" size="lg">
                  View API pricing
                </Button>
              </div>
            </div>
            <CodeBlock code={sampleRequest} language="curl" />
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                A response you can act on immediately
              </h2>
              <p className="mt-3 text-muted-foreground">
                Every activation returns the assigned number, live status, and
                price so your integration always knows exactly where things
                stand.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                <li>Consistent JSON responses across every endpoint</li>
                <li>Clear status transitions from purchase to completion</li>
                <li>Webhook delivery for incoming SMS events</li>
              </ul>
            </div>
            <CodeBlock code={sampleResponse} language="json" />
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading title="Built for real integrations" />
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {highlights.map((item) => (
              <Card key={item.title} className="p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <item.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-semibold">{item.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {item.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
