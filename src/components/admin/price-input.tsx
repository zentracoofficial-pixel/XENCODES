"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import {
  formatMultiplier,
  multiplierToMarginPercent,
  type PricePreview,
  type PricePreviewResult,
  type PriceUnit,
} from "@/lib/price-multiplier";
import { cn } from "@/lib/utils";

/**
 * A price rule typed as either a multiple of the provider's cost ("3 x") or a
 * margin percent ("67 %"), with a live look at what it would do to prices
 * before anything is saved: a few sample provider costs, the price now, the
 * price after, and the difference. The numbers come from the real pricing
 * engine on the server, so the profit rule and the NGN 500 minimum are
 * already in them.
 *
 * Renders form fields named `${name}Value` and `${name}Unit`, which the save
 * action reads.
 */
export function PriceInput({
  name,
  initialMultiplier,
  placeholder,
  preview,
  compact = false,
  ariaLabel,
  inputClassName,
}: {
  name: string;
  /** The multiple in force now, or null when the field starts empty. */
  initialMultiplier: number | null;
  placeholder?: string;
  /** Asks the server what a value would do. Empty value allowed for "clear". */
  preview: (raw: string, unit: PriceUnit) => Promise<PricePreviewResult>;
  /** Tighter layout for a table cell. */
  compact?: boolean;
  ariaLabel: string;
  inputClassName?: string;
}) {
  const [unit, setUnit] = useState<PriceUnit>("x");
  const [raw, setRaw] = useState(initialMultiplier === null ? "" : String(Number(initialMultiplier.toFixed(2))));
  const [result, setResult] = useState<PricePreviewResult | null>(null);
  const [touched, setTouched] = useState(false);

  // Typing 3 in the multiple and then switching to % should not leave "3%":
  // the same rule is shown in the other unit.
  function switchUnit(next: PriceUnit) {
    if (next === unit) return;
    const n = Number(raw);
    if (raw.trim() && Number.isFinite(n)) {
      if (next === "%" && n >= 1) setRaw(String(multiplierToMarginPercent(n)));
      if (next === "x" && n >= 0 && n < 100) setRaw(String(Number((1 / (1 - n / 100)).toFixed(2))));
    }
    setUnit(next);
  }

  useEffect(() => {
    if (!touched) return;
    let active = true;
    const timer = setTimeout(() => {
      preview(raw, unit)
        .then((r) => active && setResult(r))
        .catch(() => active && setResult({ error: "Could not work out the prices." }));
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [raw, unit, touched, preview]);

  return (
    <div className={cn(compact ? "w-full" : "max-w-xl")}>
      <div className="flex items-center gap-2">
        <input
          name={`${name}Value`}
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={raw}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e) => {
            setRaw(e.target.value);
            setTouched(true);
          }}
          className={cn(
            "h-10 rounded-lg border border-border bg-surface px-2 text-right text-sm tabular-nums outline-none focus:border-mint focus:ring-2 focus:ring-mint/25",
            compact ? "w-20" : "w-28",
            inputClassName,
          )}
        />
        <input type="hidden" name={`${name}Unit`} value={unit} />
        <div role="group" aria-label="Unit" className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
          {(["x", "%"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => switchUnit(u)}
              aria-pressed={unit === u}
              className={cn(
                "h-10 px-3 font-medium transition-colors",
                unit === u ? "bg-forest text-white" : "bg-surface text-muted-foreground hover:bg-background",
              )}
            >
              {u === "x" ? "x cost" : "% margin"}
            </button>
          ))}
        </div>
      </div>

      {touched && result ? <PreviewTable result={result} compact={compact} /> : null}
    </div>
  );
}

function PreviewTable({ result, compact }: { result: PricePreviewResult; compact: boolean }) {
  if ("error" in result) return <p className="mt-2 text-xs text-danger">{result.error}</p>;
  const p: PricePreview = result.preview;
  const same = Math.abs(p.beforeMultiplier - p.afterMultiplier) < 0.005;

  return (
    <div className={cn("mt-2 rounded-lg border border-border bg-background p-2.5 text-left text-xs", compact && "min-w-[24rem]")}>
      <p className="font-medium">
        {formatMultiplier(p.beforeMultiplier)} ({multiplierToMarginPercent(p.beforeMultiplier)}% margin)
        {same ? " stays the same" : ` becomes ${formatMultiplier(p.afterMultiplier)} (${multiplierToMarginPercent(p.afterMultiplier)}% margin)`}
      </p>
      <table className="mt-1.5 w-full whitespace-nowrap tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-0.5 pr-2 text-left font-medium">Provider cost</th>
            <th className="py-0.5 pr-2 text-right font-medium">Price now</th>
            <th className="py-0.5 pr-2 text-right font-medium">Price after</th>
            <th className="py-0.5 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row) => {
            const diff = row.afterKobo - row.beforeKobo;
            const pct = row.beforeKobo > 0 ? Math.round((diff / row.beforeKobo) * 100) : 0;
            return (
              <tr key={row.costKobo}>
                <td className="py-0.5 pr-2">{formatMoney(row.costKobo, p.currency)}</td>
                <td className="py-0.5 pr-2 text-right">{formatMoney(row.beforeKobo, p.currency)}</td>
                <td className="py-0.5 pr-2 text-right font-medium">{formatMoney(row.afterKobo, p.currency)}</td>
                <td
                  className={cn(
                    "py-0.5 text-right",
                    diff > 0 ? "text-warning" : diff < 0 ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {diff === 0 ? "no change" : `${diff > 0 ? "+" : "-"}${formatMoney(Math.abs(diff), p.currency)} (${diff > 0 ? "+" : ""}${pct}%)`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-muted-foreground">
        A guide using sample provider costs, with the profit rule and the NGN 500 minimum applied. Nothing changes until you save.
      </p>
    </div>
  );
}
