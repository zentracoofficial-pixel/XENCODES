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
 * Amounts are stored in one internal unit of account (Naira minor units) and
 * shown to each customer in the currency they chose. Every conversion goes
 * stored amount -> USD (at the platform's own rate, the same one prices are
 * built from, so it cancels out) -> the chosen currency at the market rate in
 * `DisplayRates`. Because prices, the balance, charges and funding credits
 * all use the same rates, a customer in Ghana sees one consistent set of
 * cedi amounts and never needs to see the internal unit.
 */

/** Units of each currency per 1 USD, plus how fresh they are. */
export interface DisplayRates {
  /** Units per 1 USD. NGN is the platform's own rate; the others come from
   *  the exchange-rate source. A currency with no rate is simply absent. */
  perUsd: Partial<Record<DisplayCurrencyCode, number>>;
  /** ISO timestamp of the newest rate used, or null when only the platform
   *  rate exists. */
  asOf: string | null;
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

/**
 * A Naira amount in the minor unit of `display`, or null when it cannot be
 * converted (no rate). NGN returns the amount unchanged: no round trip, no
 * rounding drift on the currency the wallet is actually in.
 */
export function convertNgnMinor(
  ngnMinor: number,
  display: DisplayCurrencyCode,
  rates: DisplayRates,
): number | null {
  if (display === "NGN") return ngnMinor;
  const ngnPerUsd = rates.perUsd.NGN;
  if (!ngnPerUsd || !(ngnPerUsd > 0)) return null;
  const usdPerUnit = display === "USD" ? 1 : rates.perUsd[display];
  if (!usdPerUnit || !(usdPerUnit > 0)) return null;
  const usd = ngnMinor / minorUnitDivisor("NGN") / ngnPerUsd;
  const target = usd * usdPerUnit;
  return Math.round(target * minorUnitDivisor(display));
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
  ngnMinor: number,
  recorded: { currency: string | null; minor: number | null } | null | undefined,
  display: DisplayCurrencyCode,
  rates: DisplayRates,
): string {
  if (recorded && recorded.currency === display && recorded.minor !== null) {
    return formatMoney(recorded.minor, display);
  }
  return formatNgnForDisplay(ngnMinor, display, rates);
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
