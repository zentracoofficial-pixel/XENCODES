"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import { formatMoney, minorUnitDivisor } from "@/lib/currency";
import { useDisplayMoney } from "@/components/currency/currency-provider";

/** The amount as plain digits for pasting into a bank app: no currency
 *  symbol, no thousands separators, and no trailing ".00". */
function plainAmount(totalMinor: number, currency: string): string {
  const major = totalMinor / minorUnitDivisor(currency);
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

/**
 * The total the customer has to pay, with a copy button, and the plain
 * warning that sending less is returned. The total includes the processing
 * fee, so this is the figure to type or paste into the bank transfer.
 */
export function ExactAmount({
  totalMinor,
  creditedMinor,
  currency,
}: {
  totalMinor: number;
  creditedMinor: number;
  currency: string;
}) {
  const money = useDisplayMoney();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const hasFee = totalMinor > creditedMinor;

  return (
    <div className="mt-3 rounded-xl border border-mint/40 bg-mint-soft px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">
        Exact amount to pay{hasFee ? " (includes the processing fee)" : ""}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-xl font-semibold tabular-nums text-forest">
          {formatMoney(totalMinor, currency)}
        </p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(plainAmount(totalMinor, currency));
            setCopied(true);
          }}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium transition-colors hover:border-mint"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy amount"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Added to your balance: {money ? money.format(creditedMinor, currency) : formatMoney(creditedMinor, currency)}.
      </p>
      <p className="mt-2.5 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Send the full amount. If you send less, the payment does not complete and the money is
          returned to you automatically, so your wallet is not credited. Pay again with the exact
          amount.
        </span>
      </p>
    </div>
  );
}
