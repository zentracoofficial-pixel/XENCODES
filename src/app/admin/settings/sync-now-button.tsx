"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runSyncNowAction } from "./actions";

/**
 * Runs the same job the daily cron calls, right now. useTransition (not
 * useActionState): this has no form and nothing to bind a <form action>
 * to, just a button firing a server action and showing what it returned.
 */
export function SyncNowButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function run() {
    startTransition(async () => {
      // Without this, an exception the action itself did not catch and
      // convert to a result (a platform-level timeout, a dropped
      // connection) would leave this callback rejecting with nothing ever
      // calling setMessage: the button flips back to "Sync now" with no
      // explanation, which reads exactly like nothing happened.
      try {
        const result = await runSyncNowAction();
        setMessage(
          result.ok
            ? {
                ok: true,
                text: `Synced ${result.servicesSynced} services, ${result.countriesSynced} countries, ${result.offersSynced} priced offers.`,
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
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={run} disabled={pending}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {message ? (
        <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
