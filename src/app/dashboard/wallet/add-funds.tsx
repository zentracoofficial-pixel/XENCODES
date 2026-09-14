"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/currency";
import { MIN_TOPUP_KOBO, MAX_TOPUP_KOBO } from "@/lib/funding-limits";
import { startTopUpAction } from "./actions";

/**
 * Add funds: the customer names their own amount.
 *
 * The suggestions below fill the field in, they do not constrain it. Any
 * amount inside the configured limits is allowed, because a customer
 * topping up for one specific number should not have to overpay to reach
 * the next package.
 *
 * Nothing here credits a balance. Continuing creates a pending funding
 * record and says plainly that payment is not connected yet, rather than
 * showing a success state for money that was never taken.
 */

const SUGGESTIONS_KOBO = [500_000, 1_000_000, 2_500_000, 5_000_000];

export function AddFunds() {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRef, setPendingRef] = useState<{
    reference: string;
    amountKobo: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountKobo = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
  const valid =
    Number.isFinite(amountKobo) &&
    amountKobo >= MIN_TOPUP_KOBO &&
    amountKobo <= MAX_TOPUP_KOBO;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await startTopUpAction(amountKobo);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.reference && result.amountKobo !== undefined) {
        setPendingRef({
          reference: result.reference,
          amountKobo: result.amountKobo,
        });
        setAmount("");
      }
    });
  }

  if (pendingRef) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Funding request created</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A pending top up of {formatNaira(pendingRef.amountKobo)} is on your
          account. Your balance has not changed, and will not change until a
          payment is received and confirmed.
        </p>

        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm text-warning">
            Card and transfer payments are not connected yet. This request is
            recorded and waiting, so nothing has been charged to you.
          </p>
        </div>

        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Reference {pendingRef.reference}
        </p>

        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setPendingRef(null)}
        >
          Request another amount
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Add funds</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter how much you want to add. Any amount between{" "}
        {formatNaira(MIN_TOPUP_KOBO)} and {formatNaira(MAX_TOPUP_KOBO)}.
      </p>

      <div className="mt-4 max-w-xs">
        <label htmlFor="topup-amount" className="text-xs font-medium text-muted-foreground">
          Amount
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            NGN
          </span>
          <input
            id="topup-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            placeholder="10,000"
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid && !isPending) submit();
            }}
            className="h-12 w-full rounded-xl border border-border bg-background pl-12 pr-3.5 text-sm tabular-nums outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
        </div>
      </div>

      {/* Shortcuts that fill the field, not a fixed set of packages. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS_KOBO.map((kobo) => (
          <button
            key={kobo}
            type="button"
            onClick={() => {
              setAmount(String(kobo / 100));
              setError(null);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors hover:border-mint hover:bg-mint-soft"
          >
            {formatNaira(kobo)}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button
        className="mt-4"
        disabled={!valid || isPending}
        onClick={submit}
      >
        {isPending ? "Creating request" : "Continue to payment"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </section>
  );
}
