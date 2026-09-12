import type { Metadata } from "next";
import { ArrowRight, HelpCircle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with your Xencodes account or an activation problem.",
};

export default function SupportPage() {
  return (
    <Section>
      <Container>
        <SectionHeading eyebrow="Support" title="How can we help?" />
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <HelpCircle className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold">Check the FAQ first</p>
                  <p className="text-sm text-muted-foreground">
                    Most questions about how Xencodes works, refunds, and
                    supported services are answered there.
                  </p>
                  <Button href="/faq" variant="outline" size="sm" className="mt-3">
                    View FAQ
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
            <p className="text-sm text-muted-foreground">
              Reporting a problem with an activation? Include the phone
              number or approximate time of purchase in your message below
              so we can look it up quickly.
            </p>
          </div>
          <ContactForm />
        </div>
      </Container>
    </Section>
  );
}
