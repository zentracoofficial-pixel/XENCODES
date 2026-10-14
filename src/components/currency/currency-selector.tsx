"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCY_META, type DisplayCurrencyCode } from "@/lib/currency-meta";
import { setDisplayCurrencyAction } from "@/app/currency-actions";
import { useDisplayMoney } from "./currency-provider";

/**
 * The currency control: the current currency (code and symbol) as a button,
 * opening a list of every display currency. The same component is used in
 * the site header, the dashboard bars and the settings page, so they can
 * never disagree. Choosing a currency only changes how prices are shown.
 */
export function CurrencySelector({
  className,
  align = "right",
  variant = "compact",
  direction = "down",
  showName = true,
}: {
  className?: string;
  align?: "left" | "right";
  /** Which way the list opens; "up" for a control at the bottom of a sidebar. */
  direction?: "down" | "up";
  /** Whether the "field" variant spells out the currency's name. */
  showName?: boolean;
  /** "compact" is the bar button; "field" is a full-width control for forms. */
  variant?: "compact" | "field";
}) {
  const money = useDisplayMoney();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!money) return null;
  const { context } = money;
  const current = CURRENCY_META[context.display];

  function choose(code: DisplayCurrencyCode | null) {
    setError(null);
    startTransition(async () => {
      const result = await setDisplayCurrencyAction(code);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const countryDefault = context.countryDefault;
  const usingPreference = context.source === "preference";

  return (
    <div ref={ref} className={cn("relative", variant === "field" ? "w-full" : "", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Display currency: ${current.name}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:border-mint hover:bg-mint-soft",
          variant === "field" ? "h-11 w-full justify-between px-3.5" : "h-10 px-3",
        )}
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="tabular-nums">{current.code}</span>
          <span className="text-muted-foreground">{current.symbol}</span>
          {variant === "field" && showName ? <span className="whitespace-nowrap text-muted-foreground">· {current.name}</span> : null}
        </span>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Display currency"
          className={cn(
            "absolute z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-panel)]",
            align === "right" ? "right-0" : "left-0",
            direction === "up" ? "bottom-full mb-2" : "mt-2",
          )}
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Show prices in
          </p>
          {context.options.map(({ code, available }) => {
            const meta = CURRENCY_META[code];
            const selected = code === context.display;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={!available || pending}
                onClick={() => choose(code)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  selected ? "bg-mint-soft text-forest" : "hover:bg-mint-soft",
                  !available && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="w-12 shrink-0 font-semibold tabular-nums">{code}</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {meta.name}
                    {!available ? " (rate unavailable)" : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-muted-foreground">{meta.symbol}</span>
                  {selected ? <Check className="h-4 w-4 text-forest" /> : null}
                </span>
              </button>
            );
          })}

          {usingPreference && countryDefault !== context.display ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(null)}
              className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-forest hover:bg-mint-soft"
            >
              Use my country&apos;s default ({countryDefault})
            </button>
          ) : null}
          {usingPreference && countryDefault === context.display ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(null)}
              className="mt-1 w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-forest hover:bg-mint-soft"
            >
              Reset to automatic
            </button>
          ) : null}

          <div className="mt-1 border-t border-border px-2.5 pb-1.5 pt-2 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              Only changes how prices are shown. Your wallet stays in Naira (₦), and numbers are charged in Naira.
              Other currencies are converted estimates (≈).
            </p>
            {context.rates.stale ? (
              <p className="mt-1 text-warning">
                Rates were last updated {context.rates.asOf ? new Date(context.rates.asOf).toLocaleDateString("en-GB") : "a while ago"}; converted prices may be slightly off.
              </p>
            ) : null}
            {error ? <p className="mt-1 text-danger">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
