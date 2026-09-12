import type { Metadata } from "next";
import { Briefcase, LifeBuoy, Mail } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Xencodes team for support or business inquiries.",
};

const channels = [
  {
    icon: LifeBuoy,
    title: "Support",
    description: "Account, billing, or activation issues.",
    detail: "support@xencodes.com",
  },
  {
    icon: Briefcase,
    title: "Business inquiries",
    description: "Partnerships, enterprise plans, and provider integrations.",
    detail: "business@xencodes.com",
  },
  {
    icon: Mail,
    title: "General",
    description: "Anything else you'd like to ask.",
    detail: "hello@xencodes.com",
  },
];

export default function ContactPage() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Contact"
          title="Get in touch"
          description="Existing customers get the fastest response through the in-dashboard support center."
        />
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-4">
            {channels.map((channel) => (
              <Card key={channel.title} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                    <channel.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold">{channel.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {channel.description}
                    </p>
                    <p className="mt-1 text-sm font-medium text-primary">
                      {channel.detail}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <ContactForm />
        </div>
      </Container>
    </Section>
  );
}
