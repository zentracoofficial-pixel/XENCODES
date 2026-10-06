import { Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/currency";
import type { SellerDeliveryRow } from "@/lib/provider-pool-quality";

/** Mirrors the ranking: a seller is acted on from this many settled orders
 *  (see GLOBAL_POOL_MIN_SAMPLE in provider-pool-quality.ts). */
const RATED_FROM = 5;

function verdict(row: SellerDeliveryRow): { label: string; variant: "success" | "warning" | "danger" | "neutral" } {
  if (row.settled < RATED_FROM) return { label: `Learning (${row.settled}/${RATED_FROM})`, variant: "neutral" };
  const rate = (row.received / row.settled) * 100;
  if (rate >= 85) return { label: "Proven", variant: "success" };
  if (rate >= 60) return { label: "Mixed", variant: "warning" };
  return { label: "Ranked last", variant: "danger" };
}

/**
 * Real delivery per GrizzlySMS seller over the last 30 days, with no minimum
 * sample, so it is visible straight away which sellers are giving codes and
 * which are not. The first row (no seller) is every order from before sellers
 * were recorded: the baseline the rest can be compared against.
 */
export function SellerDeliveryCard({ rows }: { rows: SellerDeliveryRow[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-border px-5 py-3.5">
        <Store className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
        <div>
          <h2 className="text-sm font-semibold">Delivery by seller (last 30 days)</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every number Xencodes sells comes from one GrizzlySMS seller. This is how often each
            one actually delivered a code. A seller is ranked by this once it has {RATED_FROM}{" "}
            settled orders, and one that keeps failing is moved to the back automatically.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const rate = row.settled > 0 ? Math.round((row.received / row.settled) * 100) : null;
            const v = row.providerOfferId === null ? null : verdict(row);
            return (
              <li key={row.providerOfferId ?? "none"} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.providerOfferId === null ? "Before sellers were recorded" : `Seller ${row.providerOfferId}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.received} of {row.settled} settled orders got a code
                    {row.waiting > 0 ? `, ${row.waiting} waiting` : ""} · customers paid{" "}
                    {formatMoney(row.averagePriceKobo, "NGN")} on average
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {rate === null ? "n/a" : `${rate}%`}
                  </span>
                  {v ? <Badge variant={v.variant}>{v.label}</Badge> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
