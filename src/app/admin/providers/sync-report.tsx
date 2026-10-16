"use client";

import { Badge } from "@/components/ui/badge";
import type { ProviderSyncOutcome, ProviderSyncResult, SyncResultKind } from "@/lib/provider-sync";

const RESULT_TEXT: Record<SyncResultKind, string> = {
  success: "Sync successful",
  partial: "Partly synced",
  failed: "Sync failed",
  skipped: "Already running",
};
const RESULT_VARIANT: Record<SyncResultKind, "success" | "warning" | "danger" | "neutral"> = {
  success: "success",
  partial: "warning",
  failed: "danger",
  skipped: "neutral",
};
const OVERALL_TEXT: Record<SyncResultKind, string> = {
  success: "All servers synchronized.",
  partial: "Partly synchronized: see each server below. Nothing that failed was changed.",
  failed: "No server could be synchronized. The last synced data is still in use.",
  skipped: "A sync is already running. Its result will show here when it ends.",
};

export function syncResultBadge(result: string | null | undefined) {
  const kind = (result ?? "") as SyncResultKind;
  if (!(kind in RESULT_TEXT)) return null;
  return <Badge variant={RESULT_VARIANT[kind]}>{RESULT_TEXT[kind]}</Badge>;
}

export function formatWhen(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("en-NG") : "never";
}

export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** What one sync run did, server by server. Admin only. */
export function SyncReport({
  result,
  labels,
  showOverall = true,
}: {
  result: ProviderSyncResult;
  labels: Record<string, string>;
  showOverall?: boolean;
}) {
  const kind = result.result ?? (result.ok ? "success" : "failed");
  const providers = result.providers ?? [];
  return (
    <div className="space-y-2 text-left" role="status" aria-live="polite">
      {showOverall ? (
        <p className={`text-xs font-medium ${kind === "success" ? "text-success" : kind === "partial" ? "text-warning" : "text-danger"}`}>
          {OVERALL_TEXT[kind]}
        </p>
      ) : null}
      {providers.length === 0 && result.error ? <p className="text-xs text-danger">{result.error}</p> : null}
      <ul className="space-y-1.5">
        {providers.map((outcome) => (
          <OutcomeRow key={outcome.id} outcome={outcome} label={labels[outcome.id] ?? outcome.label} />
        ))}
      </ul>
    </div>
  );
}

function OutcomeRow({ outcome, label }: { outcome: ProviderSyncOutcome; label: string }) {
  return (
    <li className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{label}</span>
        {syncResultBadge(outcome.result)}
        {outcome.durationMs ? <span className="text-muted-foreground">{formatDuration(outcome.durationMs)}</span> : null}
      </div>
      {outcome.message ? <p className="mt-1 text-muted-foreground">{outcome.message}</p> : null}
      {outcome.result !== "success" ? (
        <p className="mt-0.5 text-muted-foreground">Last full sync: {formatWhen(outcome.lastSuccessAt)}</p>
      ) : null}
    </li>
  );
}
