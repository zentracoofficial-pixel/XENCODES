"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { dismissLowBalanceWarningAction } from "./actions";

/** Shown only when the server has already decided this warning belongs on
 *  screen right now (see shouldShowLowBalanceWarning) — this component only
 *  renders it and persists a dismissal, it never decides eligibility itself. */
export function LowBalanceWarning({
  balanceKobo,
  currency,
}: {
  balanceKobo: number;
  currency: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (dismissed) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3">
      <p className="text-sm text-warning">
        Your balance is low ({formatMoney(balanceKobo, currency)}) — add funds to keep buying numbers.
      </p>
      <div className="flex items-center gap-2">
        <Button href="/dashboard/wallet" size="sm" variant="outline">
          Add funds
        </Button>
        <button
          type="button"
          aria-label="Dismiss"
          disabled={pending}
          onClick={() => {
            setDismissed(true);
            startTransition(() => {
              void dismissLowBalanceWarningAction(balanceKobo);
            });
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-warning transition-colors hover:bg-warning/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
