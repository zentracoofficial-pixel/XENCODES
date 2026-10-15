"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Info, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, majorToMinor, minorUnitDivisor } from "@/lib/currency";
import { startTopUpAction, checkTopUpStatusAction, previewTopUpAction } from "./actions";
import { ExactAmount } from "./exact-amount";

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
  fundingProvider,
  walletCurrency,
  embedded = false,
}: {
  /** ISO 4217, the account's own currency. Every amount here is in this
   *  currency's minor unit. */
  currency: string;
  minTopUpMinor: number;
  maxTopUpMinor: number;
  /** Which payment provider actually handles this currency's funding, or
   *  null when none does. Null means no code path anywhere can process a
   *  real payment in this currency yet, so the form itself is not shown at
   *  all rather than accepting an amount it could never actually collect. */
  fundingProvider: string | null;
  /** The currency the wallet is held in. A payment in another currency is
   *  converted once, when it is started, and that exact amount is credited. */
  walletCurrency: string;
  /** Rendered inside the funding card, which supplies the heading. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const shell = embedded ? "" : "rounded-xl border border-border bg-surface p-5";
  const searchParams = useSearchParams();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRef, setPendingRef] = useState<{
    reference: string;
    amountKobo: number;
    feeKobo: number;
    totalChargedKobo: number;
    creditMinor: number;
  } | null>(null);
  const [checkout, setCheckout] = useState<{
    url: string;
    amountKobo: number;
    totalChargedKobo: number;
    creditMinor: number;
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

  // The fee shown here is whatever the server says is approved for this
  // amount (see previewTopUpAction()); the browser never works one out. The
  // server resolves it again when the payment is started, and that is what
  // KoraPay is asked to charge.
  const [preview, setPreview] = useState<{
    amountKobo: number;
    feeKobo: number;
    creditMinor: number | null;
    error: string | null;
  } | null>(null);
  const latestPreview = useRef(0);
  useEffect(() => {
    if (!valid) return;
    const timer = setTimeout(() => {
      previewTopUpAction(amountKobo)
        .then((answer) => {
          if (latestPreview.current !== amountKobo) return;
          setPreview({
            amountKobo,
            feeKobo: answer.feeKobo ?? 0,
            creditMinor: answer.creditMinor ?? null,
            error: answer.error ?? null,
          });
        })
        .catch(() => {
          if (latestPreview.current !== amountKobo) return;
          setPreview({
            amountKobo,
            feeKobo: 0,
            creditMinor: null,
            error: "We could not work out the total just now. Check your connection and try again.",
          });
        });
    }, 300);
    latestPreview.current = amountKobo;
    return () => clearTimeout(timer);
  }, [amountKobo, valid]);
  const currentPreview = valid && preview?.amountKobo === amountKobo ? preview : null;
  const previewFeeKobo = currentPreview?.feeKobo ?? 0;
  const hasFee = previewFeeKobo > 0;
  const previewReady = currentPreview !== null && !currentPreview.error;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await startTopUpAction(amountKobo);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.checkoutUrl) {
        // Stop here instead of redirecting at once, so the customer can
        // copy the exact total before they leave for the payment page.
        setCheckout({
          url: result.checkoutUrl,
          amountKobo: result.amountKobo ?? amountKobo,
          totalChargedKobo: result.totalChargedKobo ?? result.amountKobo ?? amountKobo,
          creditMinor: result.creditMinor ?? result.amountKobo ?? amountKobo,
        });
        return;
      }
      if (result.reference && result.amountKobo !== undefined) {
        setPendingRef({
          reference: result.reference,
          amountKobo: result.amountKobo,
          feeKobo: result.feeKobo ?? 0,
          totalChargedKobo: result.totalChargedKobo ?? result.amountKobo,
          creditMinor: result.creditMinor ?? result.amountKobo,
        });
        setAmount("");
      }
    });
  }

  if (!fundingProvider) {
    return (
      <section className={shell}>
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
      <section className={shell}>
        {returnState === "checking" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your payment…
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
              This payment hasn&apos;t been confirmed yet. Crypto payments can take a few
              minutes to confirm on the blockchain. Refresh this page in a moment, or check
              your wallet history shortly.
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

  if (checkout) {
    return (
      <section className={shell}>
        <h2 className="text-sm font-semibold">Ready to pay</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Copy the exact amount, then continue to KoraPay and pay it.
        </p>
        <ExactAmount
          totalMinor={checkout.totalChargedKobo}
          creditedMinor={checkout.creditMinor}
          creditedCurrency={walletCurrency}
          currency={currency}
          hasFee={checkout.totalChargedKobo > checkout.amountKobo}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              window.location.href = checkout.url;
            }}
          >
            Continue to KoraPay
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCheckout(null)}>
            Change amount
          </Button>
        </div>
      </section>
    );
  }

  if (pendingRef) {
    return (
      <section className={shell}>
        <h2 className="text-sm font-semibold">Funding request created</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A pending top up of {formatMoney(pendingRef.creditMinor, walletCurrency)} is on your
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
    <section className={shell}>
      {embedded ? null : <h2 className="text-sm font-semibold">Add funds</h2>}
      <p className={embedded ? "text-sm text-muted-foreground" : "mt-1 text-sm text-muted-foreground"}>
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
              if (e.key === "Enter" && previewReady && !isPending) submit();
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

      {previewReady ? (
        <ExactAmount
          totalMinor={amountKobo + previewFeeKobo}
          creditedMinor={currentPreview?.creditMinor ?? amountKobo}
          creditedCurrency={currentPreview?.creditMinor != null ? walletCurrency : currency}
          currency={currency}
          hasFee={hasFee}
        />
      ) : null}

      {currentPreview?.error ? <p className="mt-3 text-sm text-danger">{currentPreview.error}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button
        className="mt-4"
        disabled={!previewReady || isPending}
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
