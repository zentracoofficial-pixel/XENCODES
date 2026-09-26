import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";

function formatUsdExact(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Only ever rendered when ProviderBalanceStatus.isLow is true for the
 * primary provider — this is the *supplier's* account credit (what
 * Xencodes owes GrizzlySMS), never a customer's own wallet balance, and
 * this page is admin-only (requireAdmin() gates the whole /admin tree), so
 * no customer ever sees it.
 */
export function LowProviderBalanceBanner({
  label,
  balanceUsdCents,
  detectedAt,
}: {
  label: string;
  balanceUsdCents: number | null;
  /** ISO timestamp of when this low episode started (ProviderBalanceStatus.lowSince). */
  detectedAt: string | null;
}) {
  const amount = balanceUsdCents !== null ? formatUsdExact(balanceUsdCents) : "unknown";

  return (
    <Card className="flex flex-wrap items-start gap-3 border-danger/40 bg-danger-soft p-5">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
      <div>
        <p className="font-semibold text-danger">{label} balance is low</p>
        <p className="mt-0.5 text-sm text-danger">
          {label} balance is low. Current provider credit: {amount}. Please top up the
          provider account.
        </p>
        {detectedAt ? (
          <p className="mt-1 text-xs text-danger/80">
            Detected {new Date(detectedAt).toLocaleString(undefined, {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
