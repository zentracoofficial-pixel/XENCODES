import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HealthSignal } from "@/lib/system-health";

const DOT_COLOR: Record<HealthSignal["state"], string> = {
  ok: "bg-success",
  warning: "bg-warning",
  error: "bg-danger",
};

export function SystemHealthCard({ signals }: { signals: HealthSignal[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">System health</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Live status of the connections and jobs the platform depends on.
        </p>
      </div>
      <ul className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
        {signals.map((signal) => (
          <li key={signal.label} className="flex items-start gap-2.5 px-5 py-3">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT_COLOR[signal.state])} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{signal.label}</p>
              <p className="truncate text-xs text-muted-foreground">{signal.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
