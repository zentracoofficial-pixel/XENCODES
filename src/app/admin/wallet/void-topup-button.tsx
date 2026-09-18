"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { voidUnverifiedTopupAction } from "./actions";

/**
 * Shown only next to a transaction isUnverifiedTopup() has flagged: a
 * SUCCESSFUL top up with no provider transaction id behind it, which the
 * current architecture cannot produce and only predates it. Requires
 * typing the confirmation word so this is never one accidental click on
 * a page an admin is scanning quickly.
 */
export function VoidTopupButton({ transactionId }: { transactionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="text-sm text-success">
        Voided. The balance it credited has been reversed.
      </p>
    );
  }

  if (!confirming) {
    return (
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        <AlertTriangle className="h-4 w-4" />
        Void this credit
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Type <span className="font-mono font-semibold">VOID</span> to reverse
        this credit and remove it as a legitimate funding record.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="h-9 w-32 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-danger focus:ring-2 focus:ring-danger/25"
          placeholder="VOID"
        />
        <Button
          variant="danger"
          size="sm"
          disabled={input !== "VOID" || pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await voidUnverifiedTopupAction(transactionId);
              if (result.error) {
                setError(result.error);
                return;
              }
              setDone(true);
            });
          }}
        >
          {pending ? "Voiding…" : "Confirm void"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
