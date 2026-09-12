export type SystemStatus = "operational" | "degraded" | "down";

export interface SystemComponent {
  name: string;
  status: SystemStatus;
  description: string;
}

export const systemComponents: SystemComponent[] = [
  {
    name: "Website",
    status: "operational",
    description: "Public website and marketing pages.",
  },
  {
    name: "API",
    status: "operational",
    description: "REST API for countries, services, activations, and SMS.",
  },
  {
    name: "SMS Delivery",
    status: "degraded",
    description: "Inbound SMS routing from connected number providers.",
  },
  {
    name: "Payments",
    status: "operational",
    description: "Wallet deposits and transaction processing.",
  },
  {
    name: "Number Providers",
    status: "operational",
    description: "Upstream virtual number and carrier connections.",
  },
  {
    name: "Dashboard",
    status: "operational",
    description: "Customer dashboard and real-time SMS inbox.",
  },
];

export interface StatusIncident {
  date: string;
  title: string;
  summary: string;
  resolved: boolean;
}

export const pastIncidents: StatusIncident[] = [
  {
    date: "2026-08-29",
    title: "Elevated SMS delivery delays for select carriers",
    summary:
      "Some carriers experienced delivery delays of up to 60 seconds. A backup provider route was enabled and delivery times returned to normal.",
    resolved: true,
  },
  {
    date: "2026-07-11",
    title: "Brief API latency increase",
    summary:
      "A database connection pool issue caused elevated API response times for roughly 20 minutes. Resolved by scaling the connection pool.",
    resolved: true,
  },
];
