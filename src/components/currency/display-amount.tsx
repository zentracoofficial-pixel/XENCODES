"use client";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { useDisplayMoney } from "./currency-provider";

/**
 * A Naira amount (a balance, a price, a charge, a refund) shown in the
 * customer's display currency, with the real Naira figure next to it when the
 * two differ. Every customer-facing amount goes through this so the whole
 * site switches together when the currency changes. Amounts in any currency
 * other than Naira are shown as they are.
 */
export function DisplayAmount({
  kobo,
  currency = "NGN",
  sign = "",
  naira = "below",
  align = "start",
  className,
  nairaClassName,
}: {
  /** Minor units of `currency`. */
  kobo: number;
  currency?: string;
  sign?: "" | "+" | "-";
  /** Where the real Naira amount goes when the display currency differs. */
  naira?: "below" | "inline" | "none";
  /** Alignment of the two stacked lines for naira="below". */
  align?: "start" | "end";
  className?: string;
  nairaClassName?: string;
}) {
  const money = useDisplayMoney();
  const real = formatMoney(kobo, currency);
  if (!money || currency !== "NGN" || !money.converted || kobo === 0) {
    if (kobo === 0 && money?.converted && currency === "NGN") {
      return <span className={className}>{money.format(0)}</span>;
    }
    return <span className={className}>{sign}{real}</span>;
  }
  const shown = money.format(kobo);
  if (shown === real) return <span className={className}>{sign}{real}</span>;

  return (
    <span className={cn(naira === "below" ? cn("inline-flex flex-col", align === "end" ? "items-end" : "items-start") : "", className)}>
      <span>
        {sign}
        {shown}
      </span>
      {naira === "none" ? null : (
        <span
          className={cn(
            "text-[0.75em] font-normal text-muted-foreground",
            naira === "inline" ? "ml-1" : "",
            nairaClassName,
          )}
        >
          {naira === "inline" ? `(${sign}${real})` : `${sign}${real}`}
        </span>
      )}
    </span>
  );
}
