import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProviderBalanceStatusView } from "@/lib/provider-balance-monitor";

function formatUsdExact(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTimestamp(value: Date | null): string {
  if (!value) return "Never";
  return `${value.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

const STATUS_LABEL = {
  HEALTHY: "Healthy",
  LOW_BALANCE: "Low balance",
  BALANCE_CHECK_FAILED: "Unable to verify",
} as const;

const STATUS_BADGE_VARIANT = {
  HEALTHY: "success",
  LOW_BALANCE: "danger",
  BALANCE_CHECK_FAILED: "warning",
} as const;

/**
 * The single, always-visible place an admin checks the *supplier* account
 * credit (what Xencodes owes GrizzlySMS to keep buying numbers) — never a
 * customer's own wallet balance, and never anything a customer sees, since
 * this whole page sits behind requireAdmin(). Shown regardless of state
 * (healthy, low, or unverifiable) rather than only appearing when something
 * is wrong, per the "clear provider balance monitoring section" ask.
 */
export function ProviderBalanceCard({
  label,
  connected,
  supportsBalance,
  status,
}: {
  label: string;
  connected: boolean;
  supportsBalance: boolean;
  status: ProviderBalanceStatusView | null;
}) {
  const state = !connected ? null : status?.state ?? null;
  const isLow = state === "LOW_BALANCE";

  return (
    <Card
      className={cn(
        "p-5",
        isLow && "border-danger/40 bg-danger-soft",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {isLow ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" /> : null}
          <div>
            <h2 className={cn("text-sm font-semibold", isLow && "text-danger")}>
              Provider balance monitoring
            </h2>
            <p className={cn("mt-0.5 text-xs text-muted-foreground", isLow && "text-danger/80")}>
              Provider: {label}
            </p>
          </div>
        </div>
        {state ? (
          <Badge variant={STATUS_BADGE_VARIANT[state]}>{STATUS_LABEL[state]}</Badge>
        ) : (
          <Badge variant="neutral">Not connected</Badge>
        )}
      </div>

      {!connected ? (
        <p className="mt-3 text-sm text-muted-foreground">No provider is enabled to hold credit with.</p>
      ) : !supportsBalance ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {label} does not report a balance through this integration.
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Current balance</dt>
            <dd className={cn("mt-0.5 font-medium", isLow && "text-danger")}>
              {status?.currentBalanceUsdCents != null ? formatUsdExact(status.currentBalanceUsdCents) : "Not reported"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last checked</dt>
            <dd className="mt-0.5 font-medium">{formatTimestamp(status?.lastCheckedAt ?? null)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last successful check</dt>
            <dd className="mt-0.5 font-medium">{formatTimestamp(status?.lastSuccessfulCheckAt ?? null)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Low since</dt>
            <dd className="mt-0.5 font-medium">
              {status?.isLow ? formatTimestamp(status.lowSince) : "—"}
            </dd>
          </div>
        </dl>
      )}

      {status?.lastCheckError ? (
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          Last error: {status.lastCheckError}
        </p>
      ) : null}

      {isLow ? (
        <p className="mt-3 text-sm font-medium text-danger">
          {label} balance is low: {status?.currentBalanceUsdCents != null ? formatUsdExact(status.currentBalanceUsdCents) : "unknown"}.
          Please top up the provider account.
        </p>
      ) : null}
    </Card>
  );
}
