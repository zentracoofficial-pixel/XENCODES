import type { Metadata } from "next";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { systemComponents, pastIncidents, type SystemStatus } from "@/data/status";

export const metadata: Metadata = {
  title: "System Status",
  description: "Current status of the Xencodes website, API, SMS delivery, payments, and dashboard.",
};

const statusConfig: Record<
  SystemStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  operational: { label: "Operational", icon: CheckCircle2, className: "text-success" },
  degraded: { label: "Degraded performance", icon: AlertTriangle, className: "text-warning" },
  down: { label: "Down", icon: XCircle, className: "text-danger" },
};

export default function StatusPage() {
  const allOperational = systemComponents.every((c) => c.status === "operational");

  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="System Status"
          title={allOperational ? "All systems operational" : "Some systems are experiencing issues"}
        />

        <div className="mt-10 space-y-3 max-w-2xl">
          {systemComponents.map((component) => {
            const config = statusConfig[component.status];
            return (
              <Card key={component.name} className="flex items-center justify-between p-5">
                <div>
                  <p className="font-medium">{component.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {component.description}
                  </p>
                </div>
                <div className={`flex items-center gap-2 text-sm font-medium ${config.className}`}>
                  <config.icon className="h-4 w-4" />
                  {config.label}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-16 max-w-2xl">
          <h2 className="text-lg font-semibold">Past incidents</h2>
          <div className="mt-5 space-y-4">
            {pastIncidents.map((incident) => (
              <Card key={incident.title} className="p-5">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{incident.title}</p>
                  <span className="text-xs text-muted-foreground">{incident.date}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {incident.summary}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
