"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ProviderSyncResult } from "@/lib/sync-result";
import { runUntilCurrent } from "@/lib/sync-runner";
import { syncAllProvidersAction, syncProviderAction } from "./actions";
import { SyncReport } from "./sync-report";

/** Syncs every enabled server side by side, the same job the daily cron
 *  runs. A server read country by country that needs more than one pass is
 *  carried on automatically, so one click runs until everything is current.
 *  A second click while one is running is refused by the server's lock as
 *  well as by this button. */
export function SyncAllButton({
  labels,
  runningSince,
}: {
  labels: Record<string, string>;
  /** Set when a sync is already running (from another tab or the cron). */
  runningSince: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ProviderSyncResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pass, setPass] = useState(1);
  const leftPage = useRef(false);

  useEffect(() => {
    leftPage.current = false;
    return () => {
      leftPage.current = true;
    };
  }, []);

  function run() {
    setFailure(null);
    setPass(1);
    startTransition(async () => {
      try {
        await runUntilCurrent({
          first: syncAllProvidersAction,
          again: syncProviderAction,
          onUpdate: (next, number) => {
            setResult(next);
            setPass(number);
          },
          shouldStop: () => leftPage.current,
        });
      } catch (error) {
        setFailure(
          error instanceof Error
            ? `The sync request did not finish: ${error.message}. Each server keeps its last synced data.`
            : "The sync request did not finish. Each server keeps its last synced data.",
        );
      }
    });
  }

  const busy = pending || Boolean(runningSince && !result);
  return (
    <div className="w-full max-w-md space-y-2 sm:w-auto">
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={run} disabled={busy} aria-busy={busy}>
          {pending
            ? pass > 1
              ? `Syncing, pass ${pass}…`
              : "Syncing all servers…"
            : runningSince && !result
              ? "Sync running…"
              : "Sync all enabled"}
        </Button>
      </div>
      {pending ? (
        <p className="text-right text-xs text-muted-foreground">
          {pass > 1
            ? "Carrying on with the countries still to read. Keep this page open until it finishes."
            : "Reading each server's catalog. This can take up to a minute."}
        </p>
      ) : null}
      {!pending && runningSince && !result ? (
        <p className="text-right text-xs text-muted-foreground">
          A sync started at {new Date(runningSince).toLocaleTimeString("en-NG")} is still running. Reload to see its result.
        </p>
      ) : null}
      {result ? <SyncReport result={result} labels={labels} /> : null}
      {failure ? <p className="text-xs text-danger">{failure}</p> : null}
    </div>
  );
}
