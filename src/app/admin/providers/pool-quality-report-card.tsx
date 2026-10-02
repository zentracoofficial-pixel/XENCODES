import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { QualityTier } from "@/lib/deliverability";

export interface PoolQualityRow {
  serviceSlug: string;
  serviceName: string;
  countrySlug: string;
  countryName: string;
  providerOfferId: string;
  successRatePercent: number;
  tier: QualityTier;
  sampleSize: number;
  preferred: boolean;
}

const TIER_VARIANT: Record<QualityTier, "success" | "warning" | "danger"> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

const TIER_LABEL: Record<QualityTier, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * The admin-facing view of exactly what selectQualityPool()
 * (src/lib/provider-pool-quality.ts) actually bases a purchase on: real
 * settled-order outcomes, per GrizzlySMS seller pool, for every
 * service+country pair that has enough history to rate at all. "Preferred"
 * marks the one pool purchases are currently deliberately routed to for
 * that pair — not just "the best-looking number", but the one that cleared
 * the real bar (see MEANINGFUL_ADVANTAGE_POINTS) to actually change what
 * gets bought. A pair with no pool meeting that bar still shows every rated
 * pool, with none marked preferred: exactly selectQualityPool()'s own
 * "not enough of an edge yet, change nothing" answer, made visible instead
 * of only inferable from logs.
 *
 * Empty is the expected state for a long time after this feature ships:
 * every pair needs its own real settled-order history before anything
 * appears here at all.
 */
export function PoolQualityReportCard({ rows }: { rows: PoolQualityRow[] }) {
  const pairs = new Map<string, { serviceName: string; countryName: string; rows: PoolQualityRow[] }>();
  for (const row of rows) {
    const key = `${row.serviceSlug}::${row.countrySlug}`;
    const group = pairs.get(key);
    if (group) group.rows.push(row);
    else pairs.set(key, { serviceName: row.serviceName, countryName: row.countryName, rows: [row] });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-border px-5 py-3.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
        <div>
          <h2 className="text-sm font-semibold">Pool-level quality (GrizzlySMS)</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When GrizzlySMS exposes more than one seller pool for a pair (see the price-tier
            diagnostic above), Xencodes tracks real delivery outcomes per pool and buys from a
            specific one only once it has a confirmed, materially better record — &quot;Preferred&quot;
            marks that one. Nothing appears below for a pair until it has enough of its own settled
            history to rate.
          </p>
        </div>
      </div>

      {pairs.size === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">
          No pool has enough settled history yet to rate. This is expected until real purchase
          volume accumulates for a pair with more than one pool.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {[...pairs.entries()].map(([key, group]) => (
            <div key={key}>
              <h3 className="px-5 pt-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.serviceName} · {group.countryName}
              </h3>
              <ul className="divide-y divide-border">
                {group.rows.map((row) => (
                  <li
                    key={row.providerOfferId}
                    className="flex items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        Pool {row.providerOfferId}
                        {row.preferred ? (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-forest">
                            <Sparkles className="h-3 w-3" />
                            Preferred
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{row.sampleSize} settled orders</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {row.successRatePercent}%
                      </span>
                      <Badge variant={TIER_VARIANT[row.tier]}>{TIER_LABEL[row.tier]}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
