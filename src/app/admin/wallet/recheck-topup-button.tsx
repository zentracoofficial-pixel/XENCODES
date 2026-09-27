"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recheckPendingTopupAction } from "./actions";

/**
 * Shown only next to a still-PENDING top up with a Korapay reference: asks
 * Korapay directly, right now, what actually happened to it, instead of
 * waiting on Korapay's own webhook retries or the customer happening to
 * reload their wallet page. For the exact situation that motivated this: a
 * webhook Korapay already sent and retried failed on Xencodes' own end (a
 * misconfiguration, a deploy mid-delivery), so nothing will ever prompt
 * this transaction to settle on its own again.
 */
export function RecheckTopupButton({ transactionId }: { transactionId: string }) {
  const [result, setResult] = useState<{ error?: string; outcome?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            setResult(await recheckPendingTopupAction(transactionId));
          });
        }}
      >
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {pending ? "Checking with Korapay…" : "Re-check with Korapay"}
      </Button>
      {result?.error ? <p className="text-sm text-danger">{result.error}</p> : null}
      {result?.outcome === "credited" ? (
        <p className="text-sm text-success">Verified and credited.</p>
      ) : null}
      {result?.outcome === "failed" ? (
        <p className="text-sm text-muted-foreground">
          Korapay confirms this payment did not succeed; the wallet was not credited.
        </p>
      ) : null}
      {result?.outcome === "still_pending" ? (
        <p className="text-sm text-muted-foreground">
          Still not confirmed as successful by Korapay. Nothing changed.
        </p>
      ) : null}
    </div>
  );
}
