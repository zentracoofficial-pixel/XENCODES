import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import type { AvailabilityLevel } from "@/data/types";

const config: Record<
  AvailabilityLevel,
  { label: string; variant: "success" | "warning" | "danger"; tone: "success" | "warning" | "danger" }
> = {
  available: { label: "Available", variant: "success", tone: "success" },
  limited: { label: "Limited", variant: "warning", tone: "warning" },
  unavailable: { label: "Unavailable", variant: "danger", tone: "danger" },
};

export function AvailabilityBadge({ status }: { status: AvailabilityLevel }) {
  const { label, variant } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function AvailabilityDot({ status }: { status: AvailabilityLevel }) {
  const { label, tone } = config[status];
  return <StatusDot tone={tone} label={label} pulse={status === "available"} />;
}
