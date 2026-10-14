/**
 * Local-currency wallet funding: which currencies exist, which countries each
 * one is for, and the arithmetic that turns a local payment into a wallet
 * credit. Pure and client-safe (no database, no secrets), so the same rules
 * run in the browser's preview and on the server's real check.
 *
 * The wallet stays in Naira (see src/lib/currency-config.ts). A customer in
 * Ghana pays Cedi through KoraPay and the verified payment is credited to
 * their wallet as Naira, at a rate fixed when the payment was requested.
 *
 * Exactly six local currencies, no others. KoraPay's own developer overview
 * lists mobile money pay-ins in Kenya (KES), Ghana (GHS), Cameroon (XAF),
 * Ivory Coast (XOF), Egypt (EGP) and Tanzania (TZS), which is where each
 * currency's country list below comes from. A currency is only ever offered
 * when an admin has switched it on after confirming it is enabled on the
 * Xencodes KoraPay account (see src/lib/funding-config.ts); being in this
 * file does not make it available.
 */
import { formatMoney, minorUnitDivisor } from "@/lib/currency";
import { CURRENCY_COUNTRIES, CURRENCY_META, normalizeCountryCode } from "@/lib/currency-meta";

export const FUNDING_CURRENCY_CODES = ["GHS", "KES", "XAF", "XOF", "EGP", "TZS"] as const;
export type FundingCurrencyCode = (typeof FUNDING_CURRENCY_CODES)[number];

export function isFundingCurrencyCode(value: unknown): value is FundingCurrencyCode {
  return typeof value === "string" && (FUNDING_CURRENCY_CODES as readonly string[]).includes(value);
}

export interface FundingCountry {
  iso2: string;
  name: string;
}

export interface FundingCurrencyMeta {
  code: FundingCurrencyCode;
  name: string;
  /** What the customer sees beside amounts, for example "GH₵". */
  symbol: string;
  /** The countries this currency is for. A currency is never offered to a
   *  customer whose country is known and not on this list. */
  countries: FundingCountry[];
  /** How customers pay, as far as KoraPay's own documentation says. Shown on
   *  the funding card; never a claim beyond what is documented. */
  methods: string[];
  /** KoraPay's own published limits where it publishes them, in major units,
   *  otherwise a cautious starting range. Only a starting point: an admin
   *  confirms and saves the real limits before the currency can be enabled. */
  defaultMinMajor: number;
  defaultMaxMajor: number;
  /** The payment total is rounded up to a multiple of this many major units,
   *  for currencies where KoraPay works in coarse steps (5 for the CFA
   *  francs). 0.01 means no rounding beyond the currency's smallest unit. */
  roundingStepMajor: number;
}

function countriesFor(code: keyof typeof CURRENCY_COUNTRIES): FundingCountry[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return CURRENCY_COUNTRIES[code].map((iso2) => ({ iso2, name: names.of(iso2) ?? iso2 }));
}

export const FUNDING_CURRENCIES: Record<FundingCurrencyCode, FundingCurrencyMeta> = {
  GHS: {
    code: "GHS",
    name: "Cedi",
    symbol: CURRENCY_META.GHS.symbol,
    countries: countriesFor("GHS"),
    methods: ["MTN Mobile Money", "AirtelTigo Money", "Telecel Cash"],
    defaultMinMajor: 10,
    defaultMaxMajor: 10_000,
    roundingStepMajor: 0.01,
  },
  KES: {
    code: "KES",
    name: "Shilling",
    symbol: CURRENCY_META.KES.symbol,
    countries: countriesFor("KES"),
    methods: ["M-Pesa", "Airtel Money"],
    defaultMinMajor: 10,
    defaultMaxMajor: 250_000,
    roundingStepMajor: 0.01,
  },
  XAF: {
    code: "XAF",
    name: "CFA",
    symbol: CURRENCY_META.XAF.symbol,
    countries: countriesFor("XAF"),
    methods: ["Mobile money"],
    defaultMinMajor: 500,
    defaultMaxMajor: 1_000_000,
    roundingStepMajor: 5,
  },
  XOF: {
    code: "XOF",
    name: "CFA",
    symbol: CURRENCY_META.XOF.symbol,
    countries: countriesFor("XOF"),
    methods: ["Mobile money"],
    defaultMinMajor: 500,
    defaultMaxMajor: 1_000_000,
    roundingStepMajor: 5,
  },
  EGP: {
    code: "EGP",
    name: "Pound",
    symbol: CURRENCY_META.EGP.symbol,
    countries: countriesFor("EGP"),
    methods: ["Mobile money"],
    defaultMinMajor: 20,
    defaultMaxMajor: 50_000,
    roundingStepMajor: 0.01,
  },
  TZS: {
    code: "TZS",
    name: "Shilling",
    symbol: CURRENCY_META.TZS.symbol,
    countries: countriesFor("TZS"),
    methods: ["Mobile money"],
    defaultMinMajor: 1_000,
    defaultMaxMajor: 5_000_000,
    roundingStepMajor: 0.01,
  },
};

export const normalizeCountry = normalizeCountryCode;

/** The local currency for a country, or null (Nigeria and every country
 *  without one). */
export function fundingCurrencyForCountry(iso2: string | null | undefined): FundingCurrencyCode | null {
  const country = normalizeCountry(iso2);
  if (!country) return null;
  return (
    FUNDING_CURRENCY_CODES.find((code) =>
      FUNDING_CURRENCIES[code].countries.some((c) => c.iso2 === country),
    ) ?? null
  );
}

/** Whether a currency is meant for a country at all. */
export function currencySupportsCountry(code: FundingCurrencyCode, iso2: string | null | undefined): boolean {
  const country = normalizeCountry(iso2);
  return Boolean(country && FUNDING_CURRENCIES[code].countries.some((c) => c.iso2 === country));
}

export interface FundingQuoteInput {
  currency: FundingCurrencyCode;
  /** What the customer wants to add, in the local currency's minor unit,
   *  before any fee. */
  amountMinor: number;
  /** Local units per 1 USD, and Naira per 1 USD (the wallet's own rate). */
  currencyUsdRate: number;
  ngnUsdRate: number;
  /** The admin-approved fee for this payment in local minor units, 0 when
   *  no fee is approved and enabled. Resolved server side from the fee
   *  policy (src/lib/fee-policy.ts); never a default. */
  approvedFeeMinor: number;
}

export interface FundingQuote {
  currency: FundingCurrencyCode;
  /** The amount being added, local minor units. */
  amountMinor: number;
  /** The approved fee on top, local minor units (0 when none applies). */
  feeMinor: number;
  /** What the customer pays in total, local minor units (amount + fee). */
  totalMinor: number;
  /** Naira per 1 unit of the local currency. */
  ngnPerUnit: number;
  /** What the wallet is credited, in kobo. Based on the amount alone: the
   *  fee is the cost of paying and is never credited. */
  creditKobo: number;
}

/** The step, in minor units, the amount and the total must be a multiple of
 *  (5 for the CFA francs, 1 for everything else). */
export function fundingStepMinor(currency: FundingCurrencyCode): number {
  return Math.max(1, Math.round(FUNDING_CURRENCIES[currency].roundingStepMajor * minorUnitDivisor(currency)));
}

/**
 * The one calculation behind the preview a customer sees and the amounts the
 * server records and later verifies against. Returns null when the inputs
 * cannot produce a sensible quote (missing or non-positive rates, an amount
 * that is not a whole number of the currency's step).
 *
 * Where a currency is charged in coarse steps (CFA francs, multiples of 5)
 * the amount itself must be a multiple of the step, so no rounding is ever
 * added to what the customer pays; only an approved fee is rounded up to the
 * step so the total stays chargeable.
 */
export function computeFundingQuote(input: FundingQuoteInput): FundingQuote | null {
  const { currency, amountMinor, currencyUsdRate, ngnUsdRate, approvedFeeMinor } = input;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return null;
  if (!(currencyUsdRate > 0) || !(ngnUsdRate > 0)) return null;
  if (!Number.isInteger(approvedFeeMinor) || approvedFeeMinor < 0) return null;

  const divisor = minorUnitDivisor(currency);
  const step = fundingStepMinor(currency);
  if (amountMinor % step !== 0) return null;

  const feeMinor = approvedFeeMinor > 0 ? Math.ceil(approvedFeeMinor / step) * step : 0;
  const totalMinor = amountMinor + feeMinor;

  const ngnPerUnit = ngnUsdRate / currencyUsdRate;
  const creditKobo = Math.floor((amountMinor / divisor) * ngnPerUnit * 100 + 1e-9);
  if (creditKobo <= 0) return null;

  return { currency, amountMinor, feeMinor, totalMinor, ngnPerUnit, creditKobo };
}

export type LocalAmountError = "amount_invalid" | "amount_too_low" | "amount_too_high" | "amount_step";

export function validateLocalAmount(
  amountMinor: number,
  minMinor: number,
  maxMinor: number,
  stepMinor = 1,
): LocalAmountError | null {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return "amount_invalid";
  if (amountMinor < minMinor) return "amount_too_low";
  if (amountMinor > maxMinor) return "amount_too_high";
  if (stepMinor > 1 && amountMinor % stepMinor !== 0) return "amount_step";
  return null;
}

export type LocalFundingErrorCode =
  | "not_connected"
  | "unsupported_currency"
  | "currency_unavailable"
  | "country_required"
  | "unsupported_country"
  | LocalAmountError
  | "rate_unavailable"
  | "fee_not_configured"
  | "wallet_currency";

/** Customer-facing wording for every way a local funding request can be
 *  refused, so the preview and the real request say the same thing. */
export function localFundingErrorCopy(
  error: LocalFundingErrorCode,
  currency: FundingCurrencyCode | null,
  limits?: { minMinor: number; maxMinor: number },
): string {
  const money = (minor: number) =>
    currency ? formatFundingAmount(minor, currency) : String(minor);
  switch (error) {
    case "amount_invalid":
      return "Enter a valid amount.";
    case "amount_too_low":
      return limits ? `The smallest top up is ${money(limits.minMinor)}.` : "That amount is too low.";
    case "amount_too_high":
      return limits ? `The largest single top up is ${money(limits.maxMinor)}.` : "That amount is too high.";
    case "amount_step":
      return currency
        ? `Enter an amount in multiples of ${FUNDING_CURRENCIES[currency].roundingStepMajor} ${currency}.`
        : "Enter a round amount.";
    case "fee_not_configured":
      return "This payment option is not available right now. Please try another option or check back soon.";
    case "country_required":
      return "Choose your country first.";
    case "unsupported_country":
      return "This currency is not available for your country.";
    case "unsupported_currency":
    case "currency_unavailable":
    case "not_connected":
    case "rate_unavailable":
      return "This payment option is not available right now. Please try another option or check back soon.";
    case "wallet_currency":
      return "Local-currency funding is only available for Naira wallets.";
  }
}

/** Amount in the house format ("GH₵1,000", "5,000 XAF"). Same formatter as
 *  everywhere else, so the funding card and the rest of the site agree. */
export function formatFundingAmount(amountMinor: number, currency: FundingCurrencyCode): string {
  return formatMoney(amountMinor, currency);
}
