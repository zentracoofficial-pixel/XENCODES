import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FlaggedRow {
  id: string;
  providerId: string;
  serviceSlug: string;
  countrySlug: string;
  consecutiveFails: number;
  totalFails: number;
  lastFailureReason: string | null;
  lastFailureAt: string | null;
}

/**
 * Service/country combinations that have failed to purchase repeatedly in a
 * row (see src/lib/provider-failure-stats.ts) — never used to hide or
 * disable anything automatically. This is purely for a human to look at and
 * decide whether that pair is genuinely out of stock at the supplier, or
 * something is misconfigured on this end.
 */
export function FlaggedFailuresCard({ items }: { items: FlaggedRow[] }) {
  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-border px-5 py-3.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div>
          <h2 className="text-sm font-semibold">Flagged for review</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            These service/country combinations have failed to purchase repeatedly in a row.
            Nothing is hidden or disabled automatically — this is a signal to check, not a
            decision already made.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {item.serviceSlug} · {item.countrySlug}{" "}
                <span className="text-xs font-normal text-muted-foreground">via {item.providerId}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {item.lastFailureReason ?? "No reason recorded"}
                {item.lastFailureAt
                  ? ` · ${new Date(item.lastFailureAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
                  : ""}
              </p>
            </div>
            <Badge variant="warning">
              {item.consecutiveFails} in a row · {item.totalFails} total
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
