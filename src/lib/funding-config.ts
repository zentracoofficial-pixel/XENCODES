import { readSettings, writeSetting, SETTING_KEYS, DEFAULT_TOPUP_FEE_PERCENT } from "@/lib/settings";
import { minorUnitDivisor } from "@/lib/currency";
import { readCurrencyConfig } from "@/lib/currency-config";
import { isKorapayConfigured } from "@/lib/korapay";
import {
  FUNDING_CURRENCIES,
  FUNDING_CURRENCY_CODES,
  computeFundingQuote,
  currencySupportsCountry,
  isFundingCurrencyCode,
  normalizeCountry,
  validateLocalAmount,
  type FundingCurrencyCode,
  type FundingQuote,
  type LocalAmountError,
} from "@/lib/funding-currencies";

/**
 * The admin-controlled half of local-currency funding: for each of the six
 * currencies, whether it is switched on, its exchange rate, its processing
 * fee and its limits. Everything starts switched off with no rate, so
 * nothing is offered to a customer until an admin has confirmed the payment
 * method is enabled on the Xencodes KoraPay account and entered the numbers.
 */

export interface FundingCurrencyState {
  enabled: boolean;
  /** Units of this currency per 1 USD. Null until an admin sets it. */
  usdRate: number | null;
  /** When the rate was last set, so a stale one is visible. ISO string. */
  rateUpdatedAt: string | null;
  /** Processing fee percent added on top of the amount. */
  feePercent: number;
  minMinor: number;
  maxMinor: number;
}

export type FundingStates = Record<FundingCurrencyCode, FundingCurrencyState>;

function defaultState(code: FundingCurrencyCode): FundingCurrencyState {
  const meta = FUNDING_CURRENCIES[code];
  const divisor = minorUnitDivisor(code);
  return {
    enabled: false,
    usdRate: null,
    rateUpdatedAt: null,
    feePercent: DEFAULT_TOPUP_FEE_PERCENT,
    minMinor: Math.round(meta.defaultMinMajor * divisor),
    maxMinor: Math.round(meta.defaultMaxMajor * divisor),
  };
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function readFundingStates(): Promise<FundingStates> {
  const settings = await readSettings();
  let stored: Record<string, unknown> = {};
  const raw = settings[SETTING_KEYS.fundingCurrencies];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        stored = parsed as Record<string, unknown>;
      }
    } catch {
      console.error(`[funding] "${SETTING_KEYS.fundingCurrencies}" is not valid JSON; ignoring it.`);
    }
  }

  const states = {} as FundingStates;
  for (const code of FUNDING_CURRENCY_CODES) {
    const base = defaultState(code);
    const row = (stored[code] ?? {}) as Record<string, unknown>;
    const rate = num(row.usdRate);
    states[code] = {
      enabled: row.enabled === true,
      usdRate: rate !== undefined && rate > 0 ? rate : null,
      rateUpdatedAt: typeof row.rateUpdatedAt === "string" ? row.rateUpdatedAt : null,
      feePercent: num(row.feePercent) !== undefined && (row.feePercent as number) >= 0 && (row.feePercent as number) <= 50
        ? (row.feePercent as number)
        : base.feePercent,
      minMinor: Math.round(num(row.minMinor) ?? base.minMinor),
      maxMinor: Math.round(num(row.maxMinor) ?? base.maxMinor),
    };
  }
  return states;
}

/** Whether a currency can be offered at all right now: switched on by an
 *  admin, with a rate and sane limits. (KoraPay itself being connected is a
 *  separate, environment-level check made where it matters.) */
export function isFundingStateUsable(state: FundingCurrencyState): boolean {
  return state.enabled && state.usdRate !== null && state.minMinor > 0 && state.maxMinor >= state.minMinor;
}

/** Whether the saved rate is over a week old, for the admin page's warning. */
export function isRateStale(state: FundingCurrencyState, nowMs: number = Date.now()): boolean {
  return state.rateUpdatedAt !== null && nowMs - new Date(state.rateUpdatedAt).getTime() > 7 * 86_400_000;
}

export interface FundingStatePatch {
  enabled: boolean;
  usdRate: number;
  feePercent: number;
  minMinor: number;
  maxMinor: number;
}

export type FundingStateError =
  | "rate_required"
  | "fee_invalid"
  | "limits_invalid";

/** Validates and stores one currency's settings. A rate is required to enable. */
export async function saveFundingState(
  code: FundingCurrencyCode,
  patch: FundingStatePatch,
): Promise<{ ok: true } | { ok: false; error: FundingStateError }> {
  if (patch.enabled && !(patch.usdRate > 0)) return { ok: false, error: "rate_required" };
  if (!(patch.feePercent >= 0 && patch.feePercent <= 50)) return { ok: false, error: "fee_invalid" };
  if (!(patch.minMinor > 0 && patch.maxMinor >= patch.minMinor)) return { ok: false, error: "limits_invalid" };

  const states = await readFundingStates();
  const previous = states[code];
  const rateChanged = patch.usdRate > 0 && patch.usdRate !== previous.usdRate;
  states[code] = {
    enabled: patch.enabled,
    usdRate: patch.usdRate > 0 ? patch.usdRate : null,
    rateUpdatedAt: rateChanged ? new Date().toISOString() : previous.rateUpdatedAt,
    feePercent: patch.feePercent,
    minMinor: Math.round(patch.minMinor),
    maxMinor: Math.round(patch.maxMinor),
  };
  await writeSetting(SETTING_KEYS.fundingCurrencies, JSON.stringify(states));
  return { ok: true };
}

export interface FundingOption {
  code: FundingCurrencyCode;
  state: FundingCurrencyState;
  /** Naira per 1 unit of this currency, for display. */
  ngnPerUnit: number;
}

/**
 * The local currencies a customer can be offered right now: switched on and
 * configured by an admin, KoraPay connected, and for this customer's country.
 * A customer whose country is known only ever sees currencies for that
 * country; one whose country is unknown can pick any enabled currency (the
 * server then holds them to the country they pick, see quoteLocalFunding()).
 */
export async function getFundingOptions(country: string | null | undefined): Promise<FundingOption[]> {
  if (!isKorapayConfigured()) return [];
  const [states, currencies] = await Promise.all([readFundingStates(), readCurrencyConfig()]);
  const ngn = currencies.find((c) => c.code === "NGN");
  if (!ngn) return [];

  const known = normalizeCountry(country);
  const options: FundingOption[] = [];
  for (const code of FUNDING_CURRENCY_CODES) {
    const state = states[code];
    if (!isFundingStateUsable(state) || state.usdRate === null) continue;
    if (known && !currencySupportsCountry(code, known)) continue;
    options.push({ code, state, ngnPerUnit: ngn.usdRate / state.usdRate });
  }
  return options;
}

export type LocalFundingError =
  | "not_connected"
  | "unsupported_currency"
  | "currency_unavailable"
  | "country_required"
  | "unsupported_country"
  | LocalAmountError
  | "rate_unavailable";

export type LocalFundingQuoteResult =
  | { ok: true; quote: FundingQuote; limits: { minMinor: number; maxMinor: number } }
  | { ok: false; error: LocalFundingError; limits?: { minMinor: number; maxMinor: number } };

/**
 * The server-side gate for every local funding request, preview and real
 * alike: currency known, switched on and configured, KoraPay connected, the
 * customer's country on that currency's list, the amount inside the limits.
 * `country` is the customer's saved country when they have one; `claimed` is
 * the country they chose on the form, used only when none is saved.
 */
export async function quoteLocalFunding(input: {
  savedCountry: string | null | undefined;
  claimedCountry?: string | null;
  currency: unknown;
  amountMinor: number;
}): Promise<LocalFundingQuoteResult> {
  if (!isKorapayConfigured()) return { ok: false, error: "not_connected" };
  if (!isFundingCurrencyCode(input.currency)) return { ok: false, error: "unsupported_currency" };
  const code = input.currency;

  const [states, currencies] = await Promise.all([readFundingStates(), readCurrencyConfig()]);
  const state = states[code];
  const ngn = currencies.find((c) => c.code === "NGN");
  if (!ngn || !isFundingStateUsable(state) || state.usdRate === null) {
    return { ok: false, error: "currency_unavailable" };
  }

  const country = normalizeCountry(input.savedCountry) ?? normalizeCountry(input.claimedCountry);
  if (!country) return { ok: false, error: "country_required" };
  if (!currencySupportsCountry(code, country)) return { ok: false, error: "unsupported_country" };

  const limits = { minMinor: state.minMinor, maxMinor: state.maxMinor };
  const amountError = validateLocalAmount(input.amountMinor, state.minMinor, state.maxMinor);
  if (amountError) return { ok: false, error: amountError, limits };

  const quote = computeFundingQuote({
    currency: code,
    amountMinor: input.amountMinor,
    currencyUsdRate: state.usdRate,
    ngnUsdRate: ngn.usdRate,
    feePercent: state.feePercent,
  });
  if (!quote) return { ok: false, error: "rate_unavailable" };
  return { ok: true, quote, limits };
}
