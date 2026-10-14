"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  convertMinor,
  formatStoredForDisplay,
  formatRecordedForDisplay,
  type DisplayContext,
} from "@/lib/display-currency";
import type { DisplayCurrencyCode } from "@/lib/currency-meta";

interface Value {
  context: DisplayContext;
  display: DisplayCurrencyCode;
  /** A stored amount (balance, price, charge) in the customer's currency. */
  format: (storedMinor: number, storedCurrency?: string) => string;
  /** Same, preferring the amount recorded at the time when it is in the
   *  customer's current currency (a past purchase price, a payment made). */
  formatRecorded: (
    storedMinor: number,
    recorded: { currency: string | null; minor: number | null } | null | undefined,
    storedCurrency?: string,
  ) => string;
  /** An amount converted between currencies at the page's rates (to the
   *  customer's currency by default), or null with no rate. */
  convert: (minor: number, from: string, to?: string) => number | null;
}

const CurrencyContext = createContext<Value | null>(null);

/** Hands the server-resolved currency and rates to client components, so
 *  every amount on a page is formatted by the same code. */
export function CurrencyProvider({
  context,
  children,
}: {
  context: DisplayContext;
  children: ReactNode;
}) {
  const value = useMemo<Value>(
    () => ({
      context,
      display: context.display,
      format: (minor, storedCurrency = "NGN") =>
        formatStoredForDisplay(minor, storedCurrency, context.display, context.rates),
      formatRecorded: (minor, recorded, storedCurrency = "NGN") =>
        formatRecordedForDisplay(minor, recorded, context.display, context.rates, storedCurrency),
      convert: (minor, from, to = context.display) => convertMinor(minor, from, to, context.rates),
    }),
    [context],
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Currency helpers. Outside a provider (an isolated page) it is null and
 *  callers fall back to the stored amount. */
export function useDisplayMoney(): Value | null {
  return useContext(CurrencyContext);
}
