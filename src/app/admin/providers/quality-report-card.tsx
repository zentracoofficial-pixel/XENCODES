import { Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { QualityTier } from "@/lib/deliverability";

interface Row {
  slug: string;
  label: string;
  successRatePercent: number;
  tier: QualityTier;
  sampleSize: number;
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
 * Real delivery quality, computed only from Xencodes' own settled orders —
 * see src/lib/deliverability.ts for the exact methodology (a rolling
 * 90-day window, RECEIVED vs. EXPIRED/CANCELLED/REFUNDED, a minimum sample
 * size before a pair is rated at all). GrizzlySMS itself reports no
 * quality signal of any kind (confirmed against its adapter, see
 * src/lib/provider/grizzlysms.ts), so this is the only source this figure
 * could honestly come from.
 *
 * Never used to hide, disable, or auto-route anything: this is what
 * getServiceCountries() (src/lib/inventory.ts) already uses to nudge a
 * historically poor country toward the back of the customer's own country
 * picker, and what warns a customer before they buy one — this card exists
 * so an admin can see the same real numbers, at a glance, across every
 * service and country rather than one pair at a time.
 */
export function QualityReportCard({
  windowDays,
  minSampleSize,
  overall,
  services,
  countries,
}: {
  windowDays: number;
  minSampleSize: number;
  overall: {
    settledCount: number;
    successRatePercent: number;
    refundedCount: number;
    refundRatePercent: number;
    expiredCount: number;
    expiredRatePercent: number;
  };
  services: Row[];
  countries: Row[];
}) {
  const worstServices = services.slice(0, 5);
  const bestServices = [...services].reverse().slice(0, 5);
  const worstCountries = countries.slice(0, 5);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-border px-5 py-3.5">
        <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
        <div>
          <h2 className="text-sm font-semibold">Delivery quality</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            From {overall.settledCount.toLocaleString()} settled order
            {overall.settledCount === 1 ? "" : "s"} in the last {windowDays} days. A service or
            country only appears below once it has at least {minSampleSize} settled orders —
            fewer than that isn&apos;t enough to tell real unreliability from ordinary bad luck.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
        <div className="px-3 py-3">
          <p className="text-lg font-semibold tabular-nums">{overall.successRatePercent}%</p>
          <p className="text-xs text-muted-foreground">Delivered</p>
        </div>
        <div className="px-3 py-3">
          <p className="text-lg font-semibold tabular-nums">{overall.refundRatePercent}%</p>
          <p className="text-xs text-muted-foreground">
            Refunded ({overall.refundedCount.toLocaleString()})
          </p>
        </div>
        <div className="px-3 py-3">
          <p className="text-lg font-semibold tabular-nums">{overall.expiredRatePercent}%</p>
          <p className="text-xs text-muted-foreground">
            Expired ({overall.expiredCount.toLocaleString()})
          </p>
        </div>
      </div>

      {services.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">
          Not enough settled orders yet to rate any service or country.
        </p>
      ) : (
        <div className="grid gap-0 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <QualityList title="Worst performing services" rows={worstServices} />
          <QualityList title="Best performing services" rows={bestServices} />
        </div>
      )}

      {countries.length > 0 ? (
        <div className="border-t border-border">
          <QualityList title="Worst performing countries" rows={worstCountries} />
        </div>
      ) : null}
    </Card>
  );
}

function QualityList({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <h3 className="px-5 pt-3.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.slug} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.label}</p>
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
  );
}
