"use client";

import { formatMoney } from "@/lib/currency";
import { useDisplayMoney } from "./currency-provider";

/**
 * An amount (a balance, a price, a charge, a refund) in the customer's chosen
 * currency. Every customer-facing amount goes through this, so the whole site
 * switches together when the currency changes. `recorded` is the amount as
 * the customer saw it at the time, used when it is in their current currency.
 */
export function DisplayAmount({
  kobo,
  currency = "NGN",
  sign = "",
  recorded,
  className,
}: {
  /** Stored amount, minor units of `currency`. */
  kobo: number;
  currency?: string;
  sign?: "" | "+" | "-";
  recorded?: { currency: string | null; minor: number | null } | null;
  className?: string;
}) {
  const money = useDisplayMoney();
  const text = money ? money.formatRecorded(kobo, recorded, currency) : formatMoney(kobo, currency);
  return (
    <span className={className}>
      {sign}
      {text}
    </span>
  );
}
