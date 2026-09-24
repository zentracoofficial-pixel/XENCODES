"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  toggleProviderAction,
  updateProviderPriorityAction,
  testProviderConnectionAction,
  syncProviderAction,
} from "./actions";

export interface ProviderCardProps {
  id: string;
  label: string;
  envVarNames: string[];
  enabled: boolean;
  priority: number;
  hasCredentials: boolean;
  connected: boolean;
  capabilities: {
    bulkCatalog: boolean;
    balance: boolean;
    catalogFreshness: boolean;
    connectionTest: boolean;
  } | null;
  status: {
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureError: string | null;
    servicesSynced: number | null;
    countriesSynced: number | null;
    offersSynced: number | null;
    isFresh: boolean;
  } | null;
}

const inputClass =
  "h-10 w-20 rounded-lg border border-border bg-surface px-2.5 text-sm tabular-nums outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";

export function ProviderCard({
  id,
  label,
  envVarNames,
  enabled,
  priority,
  hasCredentials,
  connected,
  capabilities,
  status,
}: ProviderCardProps) {
  const [toggling, startToggle] = useTransition();
  const [savingPriority, startSavePriority] = useTransition();
  const [testing, startTest] = useTransition();
  const [syncing, startSync] = useTransition();

  const [priorityValue, setPriorityValue] = useState(priority);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; text: string } | null>(null);

  function runTest() {
    startTest(async () => {
      try {
        setTestResult(await testProviderConnectionAction(id));
      } catch (error) {
        setTestResult({
          ok: false,
          message: error instanceof Error ? error.message : "Test request failed.",
        });
      }
    });
  }

  function runSync() {
    startSync(async () => {
      try {
        const result = await syncProviderAction(id);
        setSyncResult(
          result.ok
            ? {
                ok: true,
                text: `Synced ${result.servicesSynced} services, ${result.countriesSynced} countries, ${result.offersSynced} priced offers.`,
              }
            : { ok: false, text: result.error ?? "Sync failed." },
        );
      } catch (error) {
        setSyncResult({
          ok: false,
          text: error instanceof Error ? `Sync failed: ${error.message}` : "Sync request failed.",
        });
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{label}</h3>
        <Badge variant={enabled ? "success" : "neutral"}>
          {enabled ? "Enabled" : "Disabled"}
        </Badge>
        <Badge variant={connected ? "success" : "warning"}>
          {connected ? "Connected" : hasCredentials ? "Not connected" : "No credentials"}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">id: {id}</span>
      </div>

      {!hasCredentials ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Missing{" "}
            {envVarNames.map((name, i) => (
              <span key={name}>
                {i > 0 ? ", " : ""}
                <code className="rounded bg-surface px-1 py-0.5">{name}</code>
              </span>
            ))}{" "}
            as environment variable{envVarNames.length > 1 ? "s" : ""} on this deployment. Numbers
            cannot be sold from this provider until it is set. Never typed here: it belongs only in
            environment configuration.
          </p>
        </div>
      ) : null}

      <dl className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Last successful sync
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {status?.lastSuccessAt ? new Date(status.lastSuccessAt).toLocaleString("en-NG") : "Never"}
          </dd>
        </div>
        <div className="rounded-lg border border-border px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Last failed sync
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {status?.lastFailureAt
              ? new Date(status.lastFailureAt).toLocaleString("en-NG")
              : "None recorded"}
          </dd>
        </div>
        <div className="rounded-lg border border-border px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Services / countries
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">
            {status?.servicesSynced ?? "—"} / {status?.countriesSynced ?? "—"}
          </dd>
        </div>
        <div className="rounded-lg border border-border px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Catalog cache</dt>
          <dd className="mt-1 text-sm font-medium">
            {status?.isFresh ? "Fresh" : status?.lastSuccessAt ? "Stale" : "Never synced"}
          </dd>
        </div>
      </dl>

      {status?.lastFailureError ? (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          Last provider error: {status.lastFailureError}
        </p>
      ) : null}

      {capabilities ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Capabilities: bulk catalog read {capabilities.bulkCatalog ? "yes" : "no"}, balance{" "}
          {capabilities.balance ? "yes" : "no"}, catalog freshness{" "}
          {capabilities.catalogFreshness ? "yes" : "no"}, connection test{" "}
          {capabilities.connectionTest ? "yes" : "no (falls back to a plain catalog read)"}.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`priority-${id}`}>
            Priority
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`priority-${id}`}
              type="number"
              step="1"
              value={priorityValue}
              onChange={(e) => setPriorityValue(Number(e.target.value))}
              className={inputClass}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={savingPriority}
              onClick={() =>
                startSavePriority(async () => {
                  await updateProviderPriorityAction(id, priorityValue);
                })
              }
            >
              {savingPriority ? "Saving" : "Save"}
            </Button>
          </div>
        </div>

        <Button
          type="button"
          variant={enabled ? "outline" : "primary"}
          size="sm"
          disabled={toggling}
          onClick={() =>
            startToggle(async () => {
              await toggleProviderAction(id, !enabled);
            })
          }
        >
          {toggling ? "Saving" : enabled ? "Disable" : "Enable"}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={testing || !hasCredentials}
          onClick={runTest}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>

        <Button type="button" variant="outline" size="sm" disabled={syncing} onClick={runSync}>
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {testResult ? (
        <p
          className={`mt-2.5 flex items-center gap-1.5 text-xs ${testResult.ok ? "text-success" : "text-danger"}`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          {testResult.message}
        </p>
      ) : null}
      {syncResult ? (
        <p className={`mt-1.5 text-xs ${syncResult.ok ? "text-success" : "text-danger"}`}>
          {syncResult.text}
        </p>
      ) : null}
    </div>
  );
}
