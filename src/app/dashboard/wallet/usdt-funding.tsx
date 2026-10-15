"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { previewUsdtTopUpAction, startUsdtTopUpAction, type UsdtPreview } from "./usdt-actions";

const SUGGESTIONS_USD = [5, 10, 20, 50];

/**
 * Pay with USDT through Cryptomus. The customer enters US dollars; the
 * server works out any approved fee and what happens to their balance, then
 * sends them to Cryptomus to pay the same amount in USDT on the network they
 * choose there. Their account is in US dollars from then on.
 */
export function UsdtFunding({ minCents, maxCents }: { minCents: number; maxCents: number }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<(UsdtPreview & { forCents: number }) | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);

  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
  const valid = Number.isFinite(cents) && cents >= minCents && cents <= maxCents;

  useEffect(() => {
    if (!valid) return;
    latest.current = cents;
    const timer = setTimeout(() => {
      previewUsdtTopUpAction(cents)
        .then((answer) => {
          if (latest.current === cents) setPreview({ ...answer, forCents: cents });
        })
        .catch(() => {
          if (latest.current === cents) {
            setPreview({ forCents: cents, error: "We could not work out the total just now. Check your connection and try again." });
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [cents, valid]);

  const current = valid && preview?.forCents === cents ? preview : null;
  const ready = current !== null && !current.error;
  const fee = current?.feeCents ?? 0;

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startUsdtTopUpAction(cents);
      if (result.error || !result.checkoutUrl) {
        setError(result.error ?? "We could not start the USDT payment. Please try again.");
        return;
      }
      window.location.href = result.checkoutUrl;
    });
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Enter how much to add in US dollars, between {formatMoney(minCents, "USD")} and {formatMoney(maxCents, "USD")}.
        You pay the same amount in USDT on Cryptomus and choose the network there.
      </p>

      <div className="mt-4 max-w-xs">
        <label htmlFor="usdt-amount" className="text-xs font-medium text-muted-foreground">
          Amount
        </label>
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <input
            id="usdt-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            placeholder="20"
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready && !pending) start();
            }}
            className="h-12 w-full rounded-xl border border-border bg-background pl-8 pr-3.5 text-sm tabular-nums outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS_USD.map((usd) => usd * 100)
          .filter((value) => value >= minCents && value <= maxCents)
          .map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setAmount(String(value / 100));
                setError(null);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors hover:border-mint hover:bg-mint-soft"
            >
              {formatMoney(value, "USD")}
            </button>
          ))}
      </div>

      {ready ? (
        <dl className="mt-4 max-w-sm divide-y divide-border rounded-xl border border-border bg-background text-sm">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-muted-foreground">You pay</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(cents + fee, "USD")} in USDT</dd>
          </div>
          {fee > 0 ? (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-muted-foreground">Processing fee</dt>
              <dd className="tabular-nums">{formatMoney(fee, "USD")}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-muted-foreground">Added to your balance</dt>
            <dd className="font-semibold tabular-nums text-success">{formatMoney(cents, "USD")}</dd>
          </div>
        </dl>
      ) : null}

      {current?.switchNote ? (
        <p className="mt-3 flex max-w-md items-start gap-2 rounded-lg bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {current.switchNote} Paying with USDT puts your account in US dollars: your balance, prices and purchases
            will all be in USD.
          </span>
        </p>
      ) : null}

      {current?.error ? <p className="mt-3 text-sm text-danger">{current.error}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button className="mt-4" disabled={!ready || pending} onClick={start}>
        {pending ? "Opening Cryptomus" : "Continue to Cryptomus"}
        <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        Send the exact amount shown on Cryptomus. Your balance goes up once the payment is confirmed on the
        blockchain, usually within a few minutes.
      </p>
    </div>
  );
}
