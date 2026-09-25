"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Info, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, majorToMinor, minorUnitDivisor } from "@/lib/currency";
import { calculateTopupFeeKobo } from "@/lib/funding-limits";
import { startTopUpAction, checkTopUpStatusAction } from "./actions";

/**
 * Add funds: the customer names their own amount.
 *
 * The suggestions below fill the field in, they do not constrain it. Any
 * amount inside the configured limits is allowed, because a customer
 * topping up for one specific number should not have to overpay to reach
 * the next package.
 *
 * Nothing here credits a balance. Continuing creates a pending funding
 * record; when KoraPay is connected the browser is then sent to KoraPay's
 * own checkout page, and coming back from it only ever asks the server to
 * check what actually happened, never assumes success because the
 * customer arrived back at this URL.
 */

/** Suggestion chips scale off the account's own configured minimum rather
 *  than a fixed Naira table, so they stay sensible for any currency's own
 *  real-world value per unit. */
const SUGGESTION_MULTIPLIERS = [5, 10, 20, 50];

export function AddFunds({
  currency,
  minTopUpMinor,
  maxTopUpMinor,
  feePercent,
  feeCapKobo,
  fundingProvider,
}: {
  /** ISO 4217, the account's own currency. Every amount here is in this
   *  currency's minor unit. */
  currency: string;
  minTopUpMinor: number;
  maxTopUpMinor: number;
  /** From admin Settings. Defaults to KoraPay's own published rate. */
  feePercent: number;
  feeCapKobo: number;
  /** Which payment provider actually handles this currency's funding, or
   *  null when none does. Null means no code path anywhere can process a
   *  real payment in this currency yet, so the form itself is not shown at
   *  all rather than accepting an amount it could never actually collect. */
  fundingProvider: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRef, setPendingRef] = useState<{
    reference: string;
    amountKobo: number;
    feeKobo: number;
    totalChargedKobo: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const returningReference = searchParams.get("reference");
  const [returnState, setReturnState] = useState<
    "checking" | "credited" | "failed" | "still_pending" | null
  >(returningReference ? "checking" : null);

  // Coming back from KoraPay's checkout page. The URL saying so is not
  // trusted by itself: this asks the server to verify with KoraPay
  // directly before showing anything as successful.
  useEffect(() => {
    if (!returningReference) return;
    let active = true;
    checkTopUpStatusAction(returningReference).then((result) => {
      if (!active) return;
      setReturnState(
        result.state === "unknown_reference" ? "failed" : result.state,
      );
    });
    return () => {
      active = false;
    };
  }, [returningReference]);

  const amountKobo = majorToMinor(Number(amount.replace(/[^0-9.]/g, "")), currency);
  const valid =
    Number.isFinite(amountKobo) &&
    amountKobo >= minTopUpMinor &&
    amountKobo <= maxTopUpMinor;
  const suggestions = SUGGESTION_MULTIPLIERS.map((m) =>
    Math.min(minTopUpMinor * m, maxTopUpMinor),
  );

  // Live preview only, so the customer sees the real total before they
  // commit. The server recomputes this itself in startTopUpAction() from
  // the same settings and is what actually decides what KoraPay charges;
  // this can never be the source of truth for money moving.
  const previewFeeKobo = valid ? calculateTopupFeeKobo(amountKobo, feePercent, feeCapKobo) : 0;
  const hasFee = previewFeeKobo > 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await startTopUpAction(amountKobo);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      if (result.reference && result.amountKobo !== undefined) {
        setPendingRef({
          reference: result.reference,
          amountKobo: result.amountKobo,
          feeKobo: result.feeKobo ?? 0,
          totalChargedKobo: result.totalChargedKobo ?? result.amountKobo,
        });
        setAmount("");
      }
    });
  }

  if (!fundingProvider) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Add funds</h2>
        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm text-warning">
            {currency} funding is not available on Xencodes yet. You can
            still browse and see prices in {currency}; nothing can be added
            to this wallet until a {currency} payment method is connected.
          </p>
        </div>
      </section>
    );
  }

  if (returningReference && returnState) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        {returnState === "checking" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your payment with KoraPay…
          </p>
        ) : returnState === "credited" ? (
          <>
            <h2 className="text-sm font-semibold text-success">Payment confirmed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your wallet has been credited.
            </p>
          </>
        ) : returnState === "still_pending" ? (
          <>
            <h2 className="text-sm font-semibold">Still confirming</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              KoraPay hasn&apos;t confirmed this payment yet. Refresh this page
              in a moment, or check your wallet history shortly.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-danger">Payment not completed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This payment did not go through. Nothing was charged to your
              wallet.
            </p>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.replace("/dashboard/wallet")}
        >
          Back to wallet
        </Button>
      </section>
    );
  }

  if (pendingRef) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Funding request created</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A pending top up of {formatMoney(pendingRef.amountKobo, currency)} is on your
          account. Your balance has not changed, and will not change until a
          payment is received and confirmed.
        </p>
        {pendingRef.feeKobo > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Includes a {formatMoney(pendingRef.feeKobo, currency)} processing fee, total{" "}
            {formatMoney(pendingRef.totalChargedKobo, currency)}.
          </p>
        ) : null}

        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-sm text-warning">
            Card and transfer payments are not connected on this deployment
            yet. This request is recorded and waiting, so nothing has been
            charged to you.
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
        {formatMoney(minTopUpMinor, currency)} and {formatMoney(maxTopUpMinor, currency)}.
      </p>

      <div className="mt-4 max-w-xs">
        <label htmlFor="topup-amount" className="text-xs font-medium text-muted-foreground">
          Amount
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {currency}
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
        {suggestions.map((minorAmount) => (
          <button
            key={minorAmount}
            type="button"
            onClick={() => {
              setAmount(String(minorAmount / minorUnitDivisor(currency)));
              setError(null);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors hover:border-mint hover:bg-mint-soft"
          >
            {formatMoney(minorAmount, currency)}
          </button>
        ))}
      </div>

      {valid && hasFee ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Plus a {formatMoney(previewFeeKobo, currency)} processing fee. Total to pay:{" "}
          <span className="font-medium text-foreground">
            {formatMoney(amountKobo + previewFeeKobo, currency)}
          </span>
          . Your wallet is credited {formatMoney(amountKobo, currency)}.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button
        className="mt-4"
        disabled={!valid || isPending}
        onClick={submit}
      >
        {isPending
          ? "Creating request"
          : hasFee
            ? `Pay ${formatMoney(amountKobo + previewFeeKobo, currency)}`
            : "Continue to payment"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </section>
  );
}
