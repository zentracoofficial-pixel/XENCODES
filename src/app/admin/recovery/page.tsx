import type { Metadata } from "next";
import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/currency";
import { getOpenRecoveryCandidates, getClosedRecoveryCandidates } from "@/lib/recovery";

export const metadata: Metadata = { title: "Admin: Customer recovery" };
export const dynamic = "force-dynamic";

/**
 * Customers who keep buying numbers without receiving a code — detected by
 * evaluateNoCodeRecovery() (src/lib/recovery.ts) the moment one of their own
 * activations settles, not scanned here. This page only reads the result:
 * every OPEN NoCodeRecoveryStatus row, worst (highest no-code count) first,
 * plus a short history of what has already been resolved or dismissed.
 */
export default async function AdminRecoveryPage() {
  await requireAdmin();

  const [open, closed] = await Promise.all([
    getOpenRecoveryCandidates(),
    getClosedRecoveryCandidates(20),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <HeartPulse className="h-6 w-6 text-forest" />
          Customer recovery
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Customers who have bought several numbers recently without getting a code delivered.
          Detected from real settled orders only — a purchase that never happened (a declined
          payment, a provider that refused the sale) is never counted, and a code that has since
          arrived closes the episode automatically.
        </p>
      </div>

      {open.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No customer currently meets the recovery threshold.
        </Card>
      ) : (
        <div className="space-y-3">
          {open.map((candidate) => (
            <Link
              key={candidate.userId}
              href={`/admin/recovery/${candidate.userId}`}
              className="block"
            >
              <Card className="p-5 transition-colors hover:border-mint/50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {candidate.name || candidate.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{candidate.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {candidate.lastEmailedAt ? (
                      <Badge variant="neutral">Already contacted</Badge>
                    ) : null}
                    <Badge variant="warning">{candidate.noCodeCount} no-code</Badge>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat label="Recent purchases" value={String(candidate.purchaseCount)} />
                  <Stat label="Successful codes" value={String(candidate.successCount)} />
                  <Stat label="No-code / failed" value={String(candidate.noCodeCount)} />
                  <Stat
                    label="Wallet balance"
                    value={formatMoney(candidate.walletBalanceKobo, candidate.currency)}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Services: </span>
                    {candidate.affectedServices.join(", ") || "—"}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Countries: </span>
                    {candidate.affectedCountries.join(", ") || "—"}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Last purchase: </span>
                    {candidate.lastPurchaseAt.toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Last successful code: </span>
                    {candidate.lastSuccessAt
                      ? candidate.lastSuccessAt.toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                        })
                      : "Never"}
                  </span>
                </div>

                {candidate.recommendedCountryName ? (
                  <p className="mt-3 rounded-lg bg-mint-soft px-3 py-2 text-xs text-forest">
                    Suggested: recommend <strong>{candidate.recommendedCountryName}</strong> for{" "}
                    {candidate.recommendedServiceName} — it currently has stronger delivery
                    performance.
                  </p>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {closed.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold">Recently resolved or dismissed</h2>
          <div className="mt-3 space-y-2">
            {closed.map((candidate) => (
              <Link
                key={candidate.userId}
                href={`/admin/recovery/${candidate.userId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm transition-colors hover:border-mint/50"
              >
                <span className="min-w-0 truncate">{candidate.email}</span>
                <Badge variant={candidate.status === "RESOLVED" ? "success" : "neutral"}>
                  {candidate.status === "RESOLVED" ? "Resolved" : "Dismissed"}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
