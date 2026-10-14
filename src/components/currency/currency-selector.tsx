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
 * never disagree. Choosing a currency changes how prices are shown and which
 * currency the wallet's funding card starts on; it never moves a balance.
 */
export function CurrencySelector({
  className,
  align = "right",
  variant = "compact",
  direction = "down",
}: {
  className?: string;
  align?: "left" | "right";
  /** Which way the list opens; "up" for a control at the bottom of a sidebar. */
  direction?: "down" | "up";
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
    // In a bar (compact) on a phone, the panel anchors to the bar itself so it
    // can span the screen with an even margin; everywhere else to the button.
    <div ref={ref} className={cn(variant === "field" ? "relative w-full" : "sm:relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Display currency: ${current.name}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:border-mint hover:bg-mint-soft",
          variant === "field" ? "h-11 w-full justify-between px-3.5" : "h-10 px-2.5 sm:px-3",
        )}
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <CurrencyMark code={current.code} active />
          {/* The badge alone on the narrowest phones, so the bar keeps its breathing room. */}
          <span className={cn("tabular-nums", variant === "compact" && "max-[380px]:hidden")}>{current.code}</span>
        </span>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground max-[340px]:hidden" />}
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Display currency"
          className={cn(
            "absolute z-50 rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow-panel)] sm:w-60 sm:p-1.5",
            variant === "field" ? "max-sm:inset-x-0" : "max-sm:inset-x-3",
            "max-sm:top-full max-sm:mt-1.5",
            align === "right" ? "sm:right-0" : "sm:left-0",
            direction === "up" ? "sm:bottom-full sm:mb-2" : "sm:top-full sm:mt-2",
          )}
        >
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-2.5 sm:pb-1.5">
            Show prices in
          </p>
          {/* Two columns on a phone, so the list is half as tall; one on larger screens. */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-1 sm:gap-0">
          {context.options.map(({ code, available }) => {
            const meta = CURRENCY_META[code];
            const selected = code === context.display;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={`${code}, ${meta.name}${available ? "" : ", rate unavailable"}`}
                disabled={!available || pending}
                onClick={() => choose(code)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors sm:min-h-0 sm:border-transparent",
                  selected ? "border-mint bg-mint-soft text-forest" : "border-border hover:bg-mint-soft sm:border-transparent",
                  !available && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5" title={meta.name}>
                  <CurrencyMark code={code} active={selected} fixed />
                  <span className="font-semibold tabular-nums">{code}</span>
                  {!available ? <span className="truncate text-[11px] text-muted-foreground">No rate</span> : null}
                </span>
                {selected ? <Check className="h-4 w-4 shrink-0 text-forest" /> : null}
              </button>
            );
          })}
          </div>

          {usingPreference && countryDefault !== context.display ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(null)}
              className="mt-1.5 w-full rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-forest hover:bg-mint-soft sm:mt-1 sm:py-2"
            >
              Use my country&apos;s default ({countryDefault})
            </button>
          ) : null}
          {usingPreference && countryDefault === context.display ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(null)}
              className="mt-1.5 w-full rounded-lg px-2.5 py-2.5 text-left text-xs font-medium text-forest hover:bg-mint-soft sm:mt-1 sm:py-2"
            >
              Reset to automatic
            </button>
          ) : null}

          <div className="mt-2 border-t border-border px-2 pb-1 pt-2.5 text-[11px] leading-relaxed text-muted-foreground sm:mt-1 sm:px-2.5 sm:pb-1.5 sm:pt-2">
            <p>Your balance moves to this currency once, at today&apos;s rate.</p>
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

/**
 * A currency's mark: its symbol in a small round badge ("₦", "GH₵", "$").
 * The two CFA francs show their usual abbreviations, "FCFA" (Central) and
 * "CFA" (West), so they can be told apart.
 */
function CurrencyMark({
  code,
  active = false,
  fixed = false,
}: {
  code: keyof typeof CURRENCY_META;
  active?: boolean;
  /** A fixed width, so the codes beside a list of marks line up. */
  fixed?: boolean;
}) {
  const symbol = code === "XAF" ? "FCFA" : code === "XOF" ? "CFA" : CURRENCY_META[code].symbol;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none",
        fixed ? "w-10 px-1" : "min-w-6 px-1.5",
        active ? "bg-forest text-white" : "bg-mint-soft text-forest",
      )}
    >
      {symbol}
    </span>
  );
}
