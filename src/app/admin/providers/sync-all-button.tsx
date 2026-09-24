"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncAllProvidersAction } from "./actions";

/** Syncs every enabled provider in one pass, the same job the daily cron
 *  runs for all of them, without waiting for the schedule. */
export function SyncAllButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function run() {
    startTransition(async () => {
      try {
        const result = await syncAllProvidersAction();
        setMessage(
          result.ok
            ? {
                ok: true,
                text: `Synced ${result.servicesSynced} services, ${result.countriesSynced} countries, ${result.offersSynced} priced offers across ${result.providers?.length ?? 0} provider(s).`,
              }
            : { ok: false, text: result.error ?? "Sync failed." },
        );
      } catch (error) {
        setMessage({
          ok: false,
          text:
            error instanceof Error
              ? `Sync request failed: ${error.message}`
              : "Sync request failed unexpectedly.",
        });
      }
    });
  }

  return (
    <div className="space-y-1.5 text-right">
      <Button type="button" variant="outline" onClick={run} disabled={pending}>
        {pending ? "Syncing…" : "Sync all enabled"}
      </Button>
      {message ? (
        <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p>
      ) : null}
    </div>
  );
}
