import {
  readSettings,
  writeSetting,
  readNumber,
  SETTING_KEYS,
  DEFAULT_USD_TO_NGN_RATE,
  DEFAULT_TOPUP_FEE_CAP_KOBO,
} from "@/lib/settings";
import { majorToMinor } from "@/lib/currency";
import { isKorapayConfigured } from "@/lib/korapay";

/**
 * Xencodes sells in exactly two currencies, never a currency per country.
 *
 * NGN for Nigeria, USD for everywhere else. Not an arbitrary admin-managed
 * list: a customer never sees Ghanaian Cedi, British Pounds, or any other
 * local currency as a separate Xencodes wallet currency, no matter which
 * country they register from. See currencyForCountry() below for the one
 * rule that decides which of the two an account gets.
 *
 * Funding is not the same question as pricing. GrizzlySMS's cost is always
 * convertible into either currency (see convertUsdCentsToCurrencyMinor()),
 * so both currencies can always be priced in. Whether Xencodes can actually
 * *accept a payment* in a currency is a separate, narrower fact:
 * `fundingAvailable` is computed live from whether a real payment provider
 * is actually connected for that currency, never stored as an admin toggle
 * that could drift from reality. Today that is KoraPay for NGN only. USD
 * funding is `false` until a real USD-capable provider is wired in here;
 * nothing in this file, or anywhere downstream of it, is allowed to
 * pretend otherwise.
 */

export type CurrencyCode = "NGN" | "USD";

export interface CurrencyConfigEntry {
  code: CurrencyCode;
  /** Units of this currency per 1 USD. Admin-editable for NGN. Always
   *  exactly 1 for USD: a US dollar cost converted into US dollars needs no
   *  exchange rate, and this is never overridable into pretending otherwise. */
  usdRate: number;
  /** Smallest and largest single wallet top-up, in this currency's own
   *  minor unit. Kept admin-configurable for USD even while its funding is
   *  unavailable, so the bounds are already correct the day a USD provider
   *  is connected and no follow-up migration or admin step is needed. */
  minTopUpMinor: number;
  maxTopUpMinor: number;
  /** Ceiling on a payment provider's processing fee passed on to the
   *  customer, in this currency's minor unit. Meaningless while
   *  fundingAvailable is false, but kept ready for the same reason as the
   *  top-up bounds above. */
  feeCapMinor: number;
  /** Whether Xencodes can actually accept a top-up in this currency right
   *  now, computed live from whether a real provider is connected — never
   *  an admin-settable flag, so this can never say "available" when nothing
   *  behind it can actually process a payment. */
  fundingAvailable: boolean;
  /** Which provider handles funding for this currency, or null when none
   *  does yet. Reporting only, for the admin panel and funding UI copy. */
  fundingProvider: "korapay" | null;
}

const NGN_DEFAULTS = {
  minTopUpMinor: 10_000, // NGN 100
  maxTopUpMinor: 50_000_000, // NGN 500,000
};

// Deliberately conservative placeholders: no USD provider exists yet to
// have negotiated real bounds with, so these are a sane starting range an
// admin can revise before USD funding ever goes live.
const USD_DEFAULTS = {
  minTopUpMinor: 100, // $1.00
  maxTopUpMinor: 200_000, // $2,000.00
};

interface StoredOverride {
  usdRate?: number;
  minTopUpMinor?: number;
  maxTopUpMinor?: number;
  feeCapMinor?: number;
}

function readOverride(row: unknown): StoredOverride {
  if (typeof row !== "object" || row === null) return {};
  const r = row as Record<string, unknown>;
  return {
    usdRate: typeof r.usdRate === "number" && r.usdRate > 0 ? r.usdRate : undefined,
    minTopUpMinor: typeof r.minTopUpMinor === "number" ? r.minTopUpMinor : undefined,
    maxTopUpMinor: typeof r.maxTopUpMinor === "number" ? r.maxTopUpMinor : undefined,
    feeCapMinor: typeof r.feeCapMinor === "number" ? r.feeCapMinor : undefined,
  };
}

/**
 * Reads both currencies' admin-editable settings in one pass, and attaches
 * each one's live funding status.
 *
 * Falls back once to the pre-two-currency settings (usd_to_ngn_rate,
 * topup_fee_cap_kobo) for NGN when currencyConfig has never been written,
 * carrying that already-tuned rate forward rather than resetting it to a
 * placeholder.
 */
export async function readCurrencyConfig(): Promise<CurrencyConfigEntry[]> {
  const settings = await readSettings();
  const raw = settings[SETTING_KEYS.currencyConfig];

  let ngnOverride: StoredOverride = {};
  let usdOverride: StoredOverride = {};

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        ngnOverride = readOverride(record.NGN);
        usdOverride = readOverride(record.USD);
      }
    } catch {
      console.error(
        `[currency] "${SETTING_KEYS.currencyConfig}" is not valid JSON; ignoring stored value.`,
      );
    }
  } else {
    ngnOverride = {
      usdRate: readNumber(settings, SETTING_KEYS.usdToNgnRate, DEFAULT_USD_TO_NGN_RATE),
      feeCapMinor: readNumber(settings, SETTING_KEYS.topupFeeCapKobo, DEFAULT_TOPUP_FEE_CAP_KOBO),
    };
  }

  const ngn: CurrencyConfigEntry = {
    code: "NGN",
    usdRate: ngnOverride.usdRate ?? DEFAULT_USD_TO_NGN_RATE,
    minTopUpMinor: ngnOverride.minTopUpMinor ?? NGN_DEFAULTS.minTopUpMinor,
    maxTopUpMinor: ngnOverride.maxTopUpMinor ?? NGN_DEFAULTS.maxTopUpMinor,
    feeCapMinor: ngnOverride.feeCapMinor ?? DEFAULT_TOPUP_FEE_CAP_KOBO,
    fundingAvailable: isKorapayConfigured(),
    fundingProvider: "korapay",
  };

  const usd: CurrencyConfigEntry = {
    code: "USD",
    // Never overridable: 1 USD converted into USD is always 1 USD.
    usdRate: 1,
    minTopUpMinor: usdOverride.minTopUpMinor ?? USD_DEFAULTS.minTopUpMinor,
    maxTopUpMinor: usdOverride.maxTopUpMinor ?? USD_DEFAULTS.maxTopUpMinor,
    feeCapMinor: usdOverride.feeCapMinor ?? 0,
    // No USD-capable payment provider exists in this codebase yet. This
    // must never become a stored admin toggle: the day a real adapter is
    // wired in below, this line changes to check it, the same way NGN's
    // does above, and not before.
    fundingAvailable: false,
    fundingProvider: null,
  };

  return [ngn, usd];
}

/** Persists an admin edit to one currency's numeric settings. usdRate is
 *  silently ignored for USD, since it is never anything but 1. */
export async function updateCurrencySettings(
  code: CurrencyCode,
  patch: Partial<Pick<CurrencyConfigEntry, "usdRate" | "minTopUpMinor" | "maxTopUpMinor" | "feeCapMinor">>,
): Promise<void> {
  const settings = await readSettings();
  const raw = settings[SETTING_KEYS.currencyConfig];
  let stored: Record<string, StoredOverride> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        stored = parsed as Record<string, StoredOverride>;
      }
    } catch {
      // Overwritten below with a clean object; nothing salvageable from
      // corrupt stored JSON.
    }
  }

  const current = stored[code] ?? {};
  stored[code] = {
    ...current,
    ...(code === "NGN" && patch.usdRate !== undefined ? { usdRate: patch.usdRate } : {}),
    ...(patch.minTopUpMinor !== undefined ? { minTopUpMinor: patch.minTopUpMinor } : {}),
    ...(patch.maxTopUpMinor !== undefined ? { maxTopUpMinor: patch.maxTopUpMinor } : {}),
    ...(patch.feeCapMinor !== undefined ? { feeCapMinor: patch.feeCapMinor } : {}),
  };

  await writeSetting(SETTING_KEYS.currencyConfig, JSON.stringify(stored));
}

/** Both currencies always exist; there is no "disabled" state for either.
 *  Kept as a function (rather than inlining readCurrencyConfig()) so call
 *  sites written for the general multi-currency shape keep working
 *  unchanged. */
export async function getEnabledCurrencies(): Promise<CurrencyConfigEntry[]> {
  return readCurrencyConfig();
}

/** The currency non-visitor-specific contexts price illustrative examples
 *  in: the admin panel's own worked examples, the background catalog
 *  sync's browsing cache, and the fallback when an account somehow carries
 *  a currency that is neither NGN nor USD. NGN, matching the platform's
 *  original and still-primary market; see getVisitorCurrency() for the
 *  location-aware equivalent used on visitor-facing marketing pages. */
export async function getDefaultCurrency(): Promise<CurrencyConfigEntry> {
  const [ngn] = await readCurrencyConfig();
  return ngn;
}

export async function getCurrencyConfig(code: string): Promise<CurrencyConfigEntry | null> {
  const upper = code.toUpperCase();
  if (upper !== "NGN" && upper !== "USD") return null;
  const config = await readCurrencyConfig();
  return config.find((c) => c.code === upper) ?? null;
}

/**
 * The one rule that decides which of the two currencies a new account
 * gets: Nigeria is NGN, everywhere else is USD. `countryCode` is a
 * two-letter ISO code from the request's own edge-detected location (see
 * requestCountry() below); null/unknown never asserts "definitely outside
 * Nigeria", so it resolves to NGN, the platform's original default, rather
 * than guessing.
 */
export function currencyForCountry(countryCode: string | null | undefined): CurrencyCode {
  return countryCode && countryCode.toUpperCase() !== "NG" ? "USD" : "NGN";
}

/** The two-letter country code Vercel's edge network detected for this
 *  request, or null off Vercel (local development, another host) or before
 *  the header is set. Never geolocated or guessed by this codebase itself:
 *  Vercel sets this natively at the edge for every request. */
export async function requestCountry(): Promise<string | null> {
  const { headers } = await import("next/headers");
  const h = await headers();
  return h.get("x-vercel-ip-country");
}

/** The currency a visitor's own request suggests, for marketing pages that
 *  show an illustrative price to someone who has not registered (and so has
 *  no User.currency yet). Purely a display choice: it decides nothing about
 *  what any real account is charged, only which of the two currencies an
 *  anonymous example price is shown in. */
export async function getVisitorCurrency(): Promise<CurrencyConfigEntry> {
  const country = await requestCountry();
  const code = currencyForCountry(country);
  return (await getCurrencyConfig(code)) ?? getDefaultCurrency();
}

/** Converts a USD cost into the given currency's minor unit at that
 *  currency's own rate (always 1 for USD itself). The one place that
 *  conversion happens; src/lib/pricing.ts calls this before applying
 *  margin. */
export function convertUsdCentsToCurrencyMinor(
  usdCents: number,
  currencyConfig: CurrencyConfigEntry,
): number {
  const usd = usdCents / 100;
  return majorToMinor(usd * currencyConfig.usdRate, currencyConfig.code);
}
