import type { Metadata } from "next";
import { ShieldCheck, Target, Users } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description: "Xencodes builds infrastructure for legitimate SMS verification and testing.",
};

const values = [
  {
    icon: Target,
    title: "Reliability over promises",
    description:
      "We show live availability instead of guaranteeing results we can't control. Carriers, providers, and inventory change constantly — our interface reflects that honestly.",
  },
  {
    icon: ShieldCheck,
    title: "Legitimate use only",
    description:
      "Xencodes is built for real verification and testing workflows, not for fraud, impersonation, or bypassing a platform's security controls.",
  },
  {
    icon: Users,
    title: "Built for developers and teams",
    description:
      "From solo developers testing a sign-up flow to teams running verification at scale, the platform is designed to stay fast and predictable.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Section>
        <Container>
          <SectionHeading
            eyebrow="About Xencodes"
            title="Verification infrastructure, done properly"
            description="Xencodes provides virtual phone numbers and real-time SMS verification for legitimate account activation, QA, and developer testing — across a continuously expanding catalog of countries and services."
          />
        </Container>
      </Section>

      <Section className="bg-secondary/30">
        <Container>
          <div className="grid gap-6 sm:grid-cols-3">
            {values.map((value) => (
              <Card key={value.title} className="p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <value.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-semibold">{value.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {value.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Our acceptable use policy
            </h2>
            <p className="mt-4 text-muted-foreground">
              Xencodes must not be used for fraud, impersonation,
              unauthorized account access, or circumventing a platform&apos;s
              bans or security controls. We monitor for abuse and suspend
              accounts that violate this policy so the platform stays
              trustworthy for legitimate users and the services we integrate
              with.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
