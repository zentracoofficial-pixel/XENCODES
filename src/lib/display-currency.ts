import { formatMoney, minorUnitDivisor } from "@/lib/currency";
import {
  DISPLAY_CURRENCY_CODES,
  defaultCurrencyForCountry,
  isDisplayCurrencyCode,
  normalizeCountryCode,
  type DisplayCurrencyCode,
} from "@/lib/currency-meta";

/**
 * Display currency: what prices are SHOWN in. Pure and client-safe.
 *
 * A customer's wallet is held in their own currency, so their balance is
 * shown exactly as stored and never moves with exchange rates. Number prices
 * are worked out in Naira and converted at market rates, so a Naira amount
 * keeps its real value in every currency; a purchase is converted once, when
 * it is bought, and that exact amount is what leaves the wallet.
 */

/** Units of each currency per 1 USD, plus how fresh they are. */
export interface DisplayRates {
  /** Units per 1 USD, from the exchange-rate source (NGN falls back to the
   *  platform's own rate). A currency with no rate is simply absent. */
  perUsd: Partial<Record<DisplayCurrencyCode, number>>;
  /** ISO timestamp of the newest rate used, or null when only the platform
   *  rate exists. */
  asOf: string | null;
  /** The market Naira rate (units per 1 USD), present only when fresh; then
   *  `perUsd.NGN` is this same rate. Without it, `perUsd.NGN` falls back to
   *  the platform's own pricing rate, which is fine for showing a price but
   *  never used to move money (see convertMoneyMinor()). */
  marketNgnPerUsd?: number;
  /** True when the non-Naira rates are older than the freshness window. */
  stale: boolean;
}

export const RATE_FRESH_MS = 3 * 24 * 60 * 60 * 1000;

/** Whether a currency can actually be shown right now (it has a rate). USD
 *  and NGN always can, since both derive from the platform's Naira rate. */
export function canDisplay(code: DisplayCurrencyCode, rates: DisplayRates): boolean {
  if (code === "USD" || code === "NGN") return Boolean(rates.perUsd.NGN);
  return Boolean(rates.perUsd.NGN && rates.perUsd[code]);
}

/** Units of `code` per 1 USD, or null when there is no rate. USD is always
 *  1; NGN is the market rate when fresh (see DisplayRates). */
function unitsPerUsd(code: string, rates: DisplayRates): number | null {
  if (code === "USD") return 1;
  const rate = rates.perUsd[code as DisplayCurrencyCode];
  return rate && rate > 0 ? rate : null;
}

/**
 * An amount in the minor unit of `from` converted to the minor unit of `to`
 * (through USD), or null when either currency has no rate. The same currency
 * returns the amount unchanged: no round trip, no rounding drift.
 */
export function convertMinor(
  amountMinor: number,
  from: string,
  to: string,
  rates: DisplayRates,
): number | null {
  if (from === to) return amountMinor;
  const fromPerUsd = unitsPerUsd(from, rates);
  const toPerUsd = unitsPerUsd(to, rates);
  if (!fromPerUsd || !toPerUsd) return null;
  const usd = amountMinor / minorUnitDivisor(from) / fromPerUsd;
  return Math.round(usd * toPerUsd * minorUnitDivisor(to));
}

/**
 * Money (a balance, a payment, a refund) converted between currencies at
 * market rates, Naira included, so it keeps its real value. Null when a rate
 * is missing, including when no fresh market Naira rate is available: money
 * is never moved at the platform's pricing rate.
 */
export function convertMoneyMinor(
  amountMinor: number,
  from: string,
  to: string,
  rates: DisplayRates,
): number | null {
  if (from === to) return amountMinor;
  return convertMinor(amountMinor, from, to, {
    ...rates,
    perUsd: { ...rates.perUsd, NGN: rates.marketNgnPerUsd },
  });
}

/**
 * A Naira amount in the minor unit of `display`, or null when it cannot be
 * converted (no rate). NGN returns the amount unchanged.
 */
export function convertNgnMinor(
  ngnMinor: number,
  display: DisplayCurrencyCode,
  rates: DisplayRates,
): number | null {
  return convertMinor(ngnMinor, "NGN", display, rates);
}

/**
 * A stored amount (in `stored`) formatted in the customer's currency. An
 * amount already in that currency is shown exactly as stored; anything else
 * is converted at today's rate, falling back to the stored currency only if
 * there is no rate at all.
 */
export function formatStoredForDisplay(
  amountMinor: number,
  stored: string,
  display: DisplayCurrencyCode,
  rates: DisplayRates,
): string {
  const converted = convertMinor(amountMinor, stored, display, rates);
  if (converted === null) return formatMoney(amountMinor, stored);
  return formatMoney(converted, display);
}

/**
 * An amount formatted in the customer's chosen currency. Balances, prices
 * and charges are kept internally in one unit of account (Naira minor units)
 * and every figure a customer sees is converted from it at the same rate at
 * the same moment, so prices, balance and charges always agree with each
 * other in whatever currency they chose. Falls back to the stored amount
 * only if there is no rate at all to convert with.
 */
export function formatNgnForDisplay(
  ngnMinor: number,
  display: DisplayCurrencyCode,
  rates: DisplayRates,
): string {
  if (display === "NGN") return formatMoney(ngnMinor, "NGN");
  const converted = convertNgnMinor(ngnMinor, display, rates);
  if (converted === null) return formatMoney(ngnMinor, "NGN");
  return formatMoney(converted, display);
}

/**
 * An amount the customer saw at the time (a purchase price recorded with its
 * currency) when it is in the currency they are viewing now, otherwise the
 * stored amount converted at today's rate.
 */
export function formatRecordedForDisplay(
  storedMinor: number,
  recorded: { currency: string | null; minor: number | null } | null | undefined,
  display: DisplayCurrencyCode,
  rates: DisplayRates,
  storedCurrency: string = "NGN",
): string {
  if (recorded && recorded.currency === display && recorded.minor !== null) {
    return formatMoney(recorded.minor, display);
  }
  return formatStoredForDisplay(storedMinor, storedCurrency, display, rates);
}

export interface DisplayChoice {
  /** The customer's own saved preference, if any. */
  preference: string | null | undefined;
  /** The customer's saved country (account country), if any. */
  savedCountry: string | null | undefined;
  /** Country detected from the request: a fallback, never the first choice. */
  detectedCountry: string | null | undefined;
}

export type DisplaySource = "preference" | "saved_country" | "detected_country" | "fallback";

/**
 * Which currency to show: the customer's own saved choice first, then the
 * default for their saved country, then the default for the country
 * detected from the request, then USD. Detection is only ever a fallback,
 * and is never used when anything the customer set exists.
 */
export function resolveDisplayCurrency(choice: DisplayChoice): {
  code: DisplayCurrencyCode;
  source: DisplaySource;
} {
  if (isDisplayCurrencyCode(choice.preference)) return { code: choice.preference, source: "preference" };
  if (normalizeCountryCode(choice.savedCountry)) {
    return { code: defaultCurrencyForCountry(choice.savedCountry), source: "saved_country" };
  }
  if (normalizeCountryCode(choice.detectedCountry)) {
    return { code: defaultCurrencyForCountry(choice.detectedCountry), source: "detected_country" };
  }
  return { code: "USD", source: "fallback" };
}

/** The shape handed to the browser by the layouts: everything a client
 *  component needs to format a price, and nothing secret. */
export interface DisplayContext {
  /** What prices are shown in (already checked against the available rates). */
  display: DisplayCurrencyCode;
  /** What the customer's own settings say, before any fallback. */
  requested: DisplayCurrencyCode;
  source: DisplaySource;
  /** The default their country would give, for "restore default". */
  countryDefault: DisplayCurrencyCode;
  /** Saved account country, or the country detected for this request. */
  country: string | null;
  countrySaved: boolean;
  rates: DisplayRates;
  options: { code: DisplayCurrencyCode; available: boolean }[];
}

export function buildDisplayContext(
  choice: DisplayChoice,
  rates: DisplayRates,
): DisplayContext {
  const requested = resolveDisplayCurrency(choice);
  const display = canDisplay(requested.code, rates) ? requested.code : "NGN";
  const saved = normalizeCountryCode(choice.savedCountry);
  const country = saved ?? normalizeCountryCode(choice.detectedCountry);
  return {
    display,
    requested: requested.code,
    source: requested.source,
    countryDefault: defaultCurrencyForCountry(country),
    country,
    countrySaved: saved !== null,
    rates,
    options: DISPLAY_CURRENCY_CODES.map((code) => ({ code, available: canDisplay(code, rates) })),
  };
}
