/**
 * The one authoritative list of the currencies Xencodes can show, and which
 * countries each one is the default for. Client-safe and dependency-free so
 * the browser, the server, the formatters and the payment code all read the
 * same facts instead of keeping lists of their own.
 *
 * Three different things hang off a currency here, and they stay separate
 * everywhere else in the codebase:
 *   - the DISPLAY currency: what prices are shown in (this list, plus USD);
 *   - the WALLET currency: what a balance is actually held and charged in
 *     (Naira, see src/lib/currency-config.ts);
 *   - the FUNDING currency: what a customer can actually pay in (see
 *     src/lib/funding-currencies.ts and the admin switches behind it).
 * Being in this list makes a currency displayable, nothing more.
 */

export const DISPLAY_CURRENCY_CODES = ["NGN", "GHS", "KES", "XAF", "XOF", "EGP", "TZS", "USD"] as const;
export type DisplayCurrencyCode = (typeof DISPLAY_CURRENCY_CODES)[number];

export function isDisplayCurrencyCode(value: unknown): value is DisplayCurrencyCode {
  return typeof value === "string" && (DISPLAY_CURRENCY_CODES as readonly string[]).includes(value);
}

export interface CurrencyMeta {
  code: DisplayCurrencyCode;
  name: string;
  /** "₦", "GH₵", ... For the two CFA francs the code itself, as no
   *  symbol is in common use. */
  symbol: string;
  /** Whether the symbol goes before the amount ("₦5,000") or after it
   *  ("5,000 XAF"). */
  placement: "prefix" | "suffix";
  /** Always show exactly this many decimals ("$5.00"). Absent means show
   *  decimals only when the amount has a fractional part. */
  fixedDecimals?: number;
}

export const CURRENCY_META: Record<DisplayCurrencyCode, CurrencyMeta> = {
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦", placement: "prefix" },
  GHS: { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", placement: "prefix" },
  KES: { code: "KES", name: "Kenyan Shilling", symbol: "KSh", placement: "prefix" },
  XAF: { code: "XAF", name: "Central African CFA Franc", symbol: "XAF", placement: "suffix" },
  XOF: { code: "XOF", name: "West African CFA Franc", symbol: "XOF", placement: "suffix" },
  EGP: { code: "EGP", name: "Egyptian Pound", symbol: "E£", placement: "prefix" },
  TZS: { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", placement: "prefix" },
  USD: { code: "USD", name: "US Dollar", symbol: "$", placement: "prefix", fixedDecimals: 2 },
};

/**
 * Countries each local currency is the default for: the ones the payment
 * configuration supports, not every country that happens to use the franc.
 * XAF and XOF are deliberately each tied to a named country rather than to
 * "central Africa" or "west Africa" at large. Any other country, whatever
 * currency it uses locally, defaults to USD.
 */
export const CURRENCY_COUNTRIES: Record<Exclude<DisplayCurrencyCode, "USD">, readonly string[]> = {
  NGN: ["NG"],
  GHS: ["GH"],
  KES: ["KE"],
  XAF: ["CM"],
  XOF: ["CI"],
  EGP: ["EG"],
  TZS: ["TZ"],
};

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const upper = value?.trim().toUpperCase();
  return upper && /^[A-Z]{2}$/.test(upper) ? upper : null;
}

/** The display currency a country gets by default; USD when it has no local
 *  currency in the list or the country is unknown. */
export function defaultCurrencyForCountry(country: string | null | undefined): DisplayCurrencyCode {
  const iso2 = normalizeCountryCode(country);
  if (!iso2) return "USD";
  for (const [code, countries] of Object.entries(CURRENCY_COUNTRIES)) {
    if (countries.includes(iso2)) return code as DisplayCurrencyCode;
  }
  return "USD";
}
