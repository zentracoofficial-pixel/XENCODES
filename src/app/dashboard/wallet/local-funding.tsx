"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, majorToMinor, minorUnitDivisor } from "@/lib/currency";
import { useDisplayMoney } from "@/components/currency/currency-provider";
import { formatFundingAmount, type FundingCurrencyCode } from "@/lib/funding-currencies";
import {
  previewLocalFundingAction,
  startLocalTopUpAction,
  type LocalQuoteSummary,
} from "./local-actions";

/**
 * Pay in a local currency.
 *
 * The summary is a preview only: the server recomputes it from its own rate,
 * fee and limits when the customer confirms and is what KoraPay is actually
 * asked to charge. Nothing here credits anything.
 */
export function LocalFunding({
  code,
  symbol,
  name,
  minMinor,
  maxMinor,
}: {
  code: FundingCurrencyCode;
  symbol: string;
  name: string;
  minMinor: number;
  maxMinor: number;
}) {
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{
    amountMinor: number;
    quote: LocalQuoteSummary | null;
    error: string | null;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{ url: string; quote: LocalQuoteSummary } | null>(null);
  const [isPending, startTransition] = useTransition();
  const latest = useRef(0);

  const divisor = minorUnitDivisor(code);
  const parsed = Number(amount.replace(/[^0-9.]/g, ""));
  const amountMinor = majorToMinor(parsed, code);
  const inRange = Number.isFinite(amountMinor) && amountMinor >= minMinor && amountMinor <= maxMinor;

  // Debounced server preview so the summary always shows the server's own
  // numbers, never a second copy of the maths that could drift. Only the
  // answer for the amount currently typed is ever shown.
  useEffect(() => {
    if (!inRange) return;
    const timer = setTimeout(() => {
      previewLocalFundingAction(code, amountMinor)
        .catch(() => ({
          quote: undefined,
          error: "We could not work out the total just now. Check your connection and try again.",
        }))
        .then((answer) => {
          if (latest.current !== amountMinor) return;
          setResult({ amountMinor, quote: answer.quote ?? null, error: answer.error ?? null });
        });
    }, 350);
    latest.current = amountMinor;
    return () => clearTimeout(timer);
  }, [amountMinor, inRange, code]);

  const current = inRange && result?.amountMinor === amountMinor ? result : null;
  const quote = current?.quote ?? null;
  const loadingQuote = inRange && !current;
  const error = submitError ?? current?.error ?? null;
  const setError = setSubmitError;

  function submit() {
    setError(null);
    startTransition(async () => {
      const started = await startLocalTopUpAction(code, amountMinor);
      if (started.error || !started.checkoutUrl || !started.quote) {
        setError(started.error ?? "We could not start checkout. Nothing was charged; please try again.");
        return;
      }
      setCheckout({ url: started.checkoutUrl, quote: started.quote });
    });
  }

  if (checkout) {
    return (
      <div>
        <h3 className="text-sm font-semibold">Ready to pay</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay exactly {formatFundingAmount(checkout.quote.totalMinor, code)} at KoraPay. Your balance goes up as
          soon as the payment is confirmed.
        </p>
        <Summary quote={checkout.quote} />
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
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Pay in {name} ({code}). Any amount between{" "}
        {formatFundingAmount(minMinor, code)} and {formatFundingAmount(maxMinor, code)}.
      </p>

      <div className="mt-4 max-w-xs">
        <label htmlFor={`topup-${code}`} className="text-xs font-medium text-muted-foreground">
          Amount to add
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {symbol}
          </span>
          <input
            id={`topup-${code}`}
            type="text"
            inputMode="decimal"
            value={amount}
            placeholder={String(Math.round(minMinor / divisor) * 5)}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && quote && !isPending) submit();
            }}
            style={{ paddingLeft: `${Math.max(3, symbol.length * 0.62 + 1.6)}rem` }}
            className="h-12 w-full rounded-xl border border-border bg-background pr-3.5 text-sm tabular-nums outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
        </div>
      </div>

      {amount && !inRange && Number.isFinite(parsed) && parsed > 0 ? (
        <p className="mt-3 text-sm text-danger">
          {amountMinor < minMinor
            ? `The smallest top up is ${formatFundingAmount(minMinor, code)}.`
            : `The largest single top up is ${formatFundingAmount(maxMinor, code)}.`}
        </p>
      ) : null}

      {loadingQuote && !quote ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculating
        </p>
      ) : null}

      {quote ? <Summary quote={quote} /> : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button className="mt-4" disabled={!quote || isPending || loadingQuote} onClick={submit}>
        {isPending
          ? "Creating request"
          : quote
            ? `Pay ${formatFundingAmount(quote.totalMinor, code)}`
            : "Continue to payment"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Summary({ quote }: { quote: LocalQuoteSummary }) {
  const code = quote.currency;
  const money = useDisplayMoney();
  const display = money?.display ?? code;
  // One decimal style for the whole summary: if any line has pennies, all do.
  const divisor = minorUnitDivisor(code);
  const fixedDecimals = [quote.totalMinor, quote.feeMinor, quote.amountMinor].some((v) => v % divisor !== 0);
  const fmt = (minor: number) => formatMoney(minor, code, { fixedDecimals });
  // Exactly what the balance goes up by, fixed when the payment starts.
  const added = formatMoney(quote.creditMinor, quote.creditCurrency, {
    fixedDecimals: quote.creditCurrency === code && fixedDecimals,
  });
  // The rate this payment is actually converted at, in the customer's own
  // currency; only worth showing when they pay in a different currency.
  const rate = display !== code && money ? fundingRate(code, display, quote.ngnPerUnit, money.context.rates.perUsd) : null;
  return (
    <dl className="mt-4 max-w-sm divide-y divide-border rounded-xl border border-border bg-background text-sm">
      <Row label="You pay" value={fmt(quote.totalMinor)} strong />
      {/* Shown only when an admin-approved fee applies to this payment. */}
      {quote.feeMinor > 0 ? <Row label="Processing fee" value={fmt(quote.feeMinor)} /> : null}
      {rate ? <Row label="Exchange rate" value={rate} /> : null}
      <Row label="Added to your balance" value={added} strong />
    </dl>
  );
}

/** "1 GHS = 0.0852 USD": the rate the payment is credited at, expressed in
 *  the customer's own currency (the stored unit converted at the same rates
 *  the balance is shown with). */
function fundingRate(
  from: string,
  to: string,
  storedPerUnit: number,
  perUsd: Partial<Record<string, number>>,
): string | null {
  const storedPerUsd = perUsd.NGN;
  const toPerUsd = perUsd[to];
  if (!storedPerUsd || !toPerUsd) return null;
  const value = (storedPerUnit / storedPerUsd) * toPerUsd;
  const digits = value >= 100 ? 2 : value >= 1 ? 3 : 4;
  return `1 ${from} = ${value.toLocaleString("en", { maximumFractionDigits: digits })} ${to}`;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
