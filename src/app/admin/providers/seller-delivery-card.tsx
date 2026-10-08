import { Store, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/currency";
import type { SellerDeliveryRow } from "@/lib/provider-pool-quality";

/** Mirrors the ranking: a seller is acted on from this many settled orders
 *  (see GLOBAL_POOL_MIN_SAMPLE in provider-pool-quality.ts). */
const RATED_FROM = 5;

const rateOf = (row: SellerDeliveryRow) => (row.settled > 0 ? row.received / row.settled : 0);
const isRated = (row: SellerDeliveryRow) => row.providerOfferId !== null && row.settled >= RATED_FROM;

/** Rated sellers first, best delivery rate first (more settled orders breaks
 *  a tie, since a rate over more orders is firmer). Then sellers still being
 *  learned, busiest first. The pre-seller baseline row always goes last. */
function byDelivery(a: SellerDeliveryRow, b: SellerDeliveryRow) {
  const group = (row: SellerDeliveryRow) => (row.providerOfferId === null ? 2 : isRated(row) ? 0 : 1);
  if (group(a) !== group(b)) return group(a) - group(b);
  if (group(a) === 0) return rateOf(b) - rateOf(a) || b.settled - a.settled;
  return b.settled + b.waiting - (a.settled + a.waiting);
}

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
export function SellerDeliveryCard({ rows: unsorted }: { rows: SellerDeliveryRow[] }) {
  const rows = [...unsorted].sort(byDelivery);
  const leader = rows.find(isRated);
  const leaderRate = leader ? Math.round(rateOf(leader) * 100) : null;
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

      {leader ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-mint-soft px-5 py-3">
          <Trophy className="h-4 w-4 shrink-0 text-forest" />
          <p className="text-sm">
            <span className="font-semibold text-forest">Delivering best: Seller {leader.providerOfferId}</span>{" "}
            <span className="text-muted-foreground">
              {leaderRate}% ({leader.received} of {leader.settled} settled orders got a code)
            </span>
          </p>
        </div>
      ) : rows.length > 0 ? (
        <p className="border-b border-border bg-background px-5 py-3 text-sm text-muted-foreground">
          No seller has {RATED_FROM} settled orders yet, so there is no leader to name. Sellers are
          listed busiest first until one does.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row, index) => {
            const rate = row.settled > 0 ? Math.round((row.received / row.settled) * 100) : null;
            const v = row.providerOfferId === null ? null : verdict(row);
            return (
              <li key={row.providerOfferId ?? "none"} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {isRated(row) ? <span className="mr-1.5 text-muted-foreground">#{index + 1}</span> : null}
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
