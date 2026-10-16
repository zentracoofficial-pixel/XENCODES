/**
 * The shape of a sync result and how several providers' results combine into
 * one. A plain module (no database, no server-only imports) so the admin's
 * browser code can use it as well as the sync itself.
 */

/** What one sync did: "success" read everything; "partial" refreshed part
 *  of the catalog and kept the last good data for the rest; "failed"
 *  changed nothing; "skipped" did not start because a sync of that server
 *  was already running. */
export type SyncResultKind = "success" | "partial" | "failed" | "skipped";

export interface ProviderSyncResult {
  ok: boolean;
  /** Across every provider this run touched: "success" when all of them
   *  fully synced, "failed" when none changed anything, "partial" between. */
  result?: SyncResultKind;
  /** Combined across every provider this run touched. Not deduplicated: a
   *  service two providers both sell counts twice. Good enough for "did
   *  this run do something"; see `providers` for the real per-provider
   *  breakdown a dashboard should actually display. */
  servicesSynced?: number;
  countriesSynced?: number;
  offersSynced?: number;
  error?: string;
  providers?: ProviderSyncOutcome[];
}

export interface ProviderSyncOutcome {
  id: string;
  label: string;
  ok: boolean;
  result: SyncResultKind;
  servicesSynced?: number;
  countriesSynced?: number;
  offersSynced?: number;
  /** For a provider read country by country (Server II). */
  countriesRead?: number;
  countriesTotal?: number;
  /** For a provider read country by country: how many countries have been
   *  read within the last day, across runs. */
  countriesCurrent?: number;
  durationMs?: number;
  /** What the admin is told about this run. Safe to show: no raw API text. */
  message?: string;
  error?: string;
  /** When this provider last fully synced, after this run. */
  lastSuccessAt?: string | null;
}

/** One result for a run over one or more providers. */
export function summarize(outcomes: ProviderSyncOutcome[]): ProviderSyncResult {
  const result: SyncResultKind = outcomes.every((o) => o.result === "success")
    ? "success"
    : outcomes.some((o) => o.result === "success" || o.result === "partial")
      ? "partial"
      : outcomes.every((o) => o.result === "skipped")
        ? "skipped"
        : "failed";
  return {
    ok: result === "success",
    result,
    servicesSynced: outcomes.reduce((sum, o) => sum + (o.servicesSynced ?? 0), 0),
    countriesSynced: outcomes.reduce((sum, o) => sum + (o.countriesSynced ?? 0), 0),
    offersSynced: outcomes.reduce((sum, o) => sum + (o.offersSynced ?? 0), 0),
    error:
      result === "success"
        ? undefined
        : outcomes
            .filter((o) => o.result !== "success")
            .map((o) => `${o.label}: ${o.error ?? o.message ?? o.result}`)
            .join("; "),
    providers: outcomes,
  };
}

/** Whether another pass would make progress: a server read country by
 *  country that is not yet current everywhere and did read something this
 *  pass (a pass that read nothing, because it was refused, is not retried
 *  at once). */
export function outcomeNeedsAnotherPass(outcome: ProviderSyncOutcome): boolean {
  return (
    outcome.result === "partial" &&
    outcome.countriesTotal !== undefined &&
    outcome.countriesCurrent !== undefined &&
    outcome.countriesCurrent < outcome.countriesTotal &&
    (outcome.countriesRead ?? 0) > 0
  );
}
