import type { Metadata } from "next";
import { ArrowRight, BookOpen, KeyRound, Terminal, Webhook } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Developer Portal",
  description:
    "The Xencodes developer portal: documentation, API keys, webhooks, and everything you need to integrate virtual number verification.",
};

const resources = [
  {
    icon: BookOpen,
    title: "Documentation",
    description: "Getting started, authentication, and the full API reference.",
    href: "/developers/docs",
  },
  {
    icon: KeyRound,
    title: "API keys",
    description: "Create and manage API keys from your dashboard.",
    href: "/dashboard/api/keys",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    description: "Subscribe to activation and SMS delivery events.",
    href: "/developers/docs#webhooks",
  },
  {
    icon: Terminal,
    title: "Changelog",
    description: "Track updates and changes to the Xencodes API.",
    href: "/developers/changelog",
  },
];

export default function DevelopersPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="Developers"
            title="Build with Xencodes"
            description="Everything you need to integrate virtual numbers and SMS verification into your own products, tooling, and QA pipelines."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/developers/docs" size="lg">
              Read the documentation
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/api" variant="outline" size="lg">
              API overview
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {resources.map((resource) => (
              <a key={resource.title} href={resource.href} className="block group">
                <Card className="h-full p-6 transition-colors group-hover:border-primary/40 group-hover:bg-secondary">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted text-primary">
                    <resource.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 font-semibold">{resource.title}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {resource.description}
                  </p>
                </Card>
              </a>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
