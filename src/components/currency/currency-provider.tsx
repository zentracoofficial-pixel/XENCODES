"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  chargedInNgnLabel,
  formatNgnForDisplay,
  type DisplayContext,
} from "@/lib/display-currency";
import type { DisplayCurrencyCode } from "@/lib/currency-meta";

interface Value {
  context: DisplayContext;
  display: DisplayCurrencyCode;
  /** True when prices are shown in something other than Naira. */
  converted: boolean;
  /** A Naira amount (minor units) in the display currency, "≈"-marked when
   *  converted. */
  format: (ngnMinor: number) => string;
  /** "Charged as ₦… from your Naira wallet". */
  chargedLabel: (ngnMinor: number) => string;
}

const CurrencyContext = createContext<Value | null>(null);

/** Hands the server-resolved display currency and rates to client components,
 *  so every price on a page is formatted by the same code. */
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
      converted: context.display !== "NGN",
      format: (ngnMinor) => formatNgnForDisplay(ngnMinor, context.display, context.rates),
      chargedLabel: chargedInNgnLabel,
    }),
    [context],
  );
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Display-currency helpers. Outside a provider (an isolated page) it falls
 *  back to plain Naira, which is always correct. */
export function useDisplayMoney(): Value | null {
  return useContext(CurrencyContext);
}
