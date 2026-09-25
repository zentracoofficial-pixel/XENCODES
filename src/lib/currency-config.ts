import {
  readSettings,
  writeSetting,
  readNumber,
  SETTING_KEYS,
  DEFAULT_USD_TO_NGN_RATE,
  DEFAULT_TOPUP_FEE_CAP_KOBO,
} from "@/lib/settings";
import { isValidCurrencyCode, majorToMinor } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

/**
 * Which currencies Xencodes actually sells in, and the platform's own rate
 * for each — the multi-currency analogue of src/lib/provider/config.ts.
 *
 * A currency being enabled here means two things: an admin has confirmed
 * KoraPay can actually charge and settle it for this account (not
 * something this file assumes on anyone's behalf), and Xencodes has a real
 * USD conversion rate to price GrizzlySMS's dollar-denominated costs into
 * it. Only NGN ships enabled by default, matching the platform's existing,
 * confirmed-working configuration exactly: enabling anything else is a
 * deliberate admin action on /admin/currencies, not something this code
 * turns on by itself.
 */

export interface CurrencyConfigEntry {
  /** ISO 4217, e.g. "NGN". */
  code: string;
  enabled: boolean;
  /** Units of this currency per 1 USD, the same role usdToNgnRate played
   *  before there was more than one currency. */
  usdRate: number;
  /** Smallest and largest single wallet top-up, in this currency's own
   *  minor unit. Each currency needs its own bounds: "100 minor units" is a
   *  sensible floor for NGN but not for a currency with a very different
   *  real-world value per unit. */
  minTopUpMinor: number;
  maxTopUpMinor: number;
  /** Ceiling on KoraPay's processing fee passed on to the customer, in this
   *  currency's minor unit. */
  feeCapMinor: number;
  /** Lower is offered first in the registration currency picker, and is
   *  what getDefaultCurrency() returns when no other rule applies (the
   *  currency anonymous marketing pages price their examples in). */
  priority: number;
  /** Optional label for the picker, e.g. "Nigeria" — purely cosmetic,
   *  never used to decide what a currency actually is. */
  countryLabel?: string;
}

const NGN_DEFAULT: CurrencyConfigEntry = {
  code: "NGN",
  enabled: true,
  usdRate: DEFAULT_USD_TO_NGN_RATE,
  minTopUpMinor: 10_000, // NGN 100
  maxTopUpMinor: 50_000_000, // NGN 500,000
  feeCapMinor: DEFAULT_TOPUP_FEE_CAP_KOBO,
  priority: 0,
  countryLabel: "Nigeria",
};

function normalize(entries: CurrencyConfigEntry[]): CurrencyConfigEntry[] {
  const byCode = new Map(entries.map((e) => [e.code.toUpperCase(), e]));
  // NGN always exists, even if somehow dropped from stored config: it is
  // the one currency this platform has always actually sold in, and
  // disappearing it would strand every existing NGN account.
  if (!byCode.has("NGN")) byCode.set("NGN", NGN_DEFAULT);
  return Array.from(byCode.values()).sort((a, b) => a.priority - b.priority);
}

/**
 * Reads every currency's config in one pass.
 *
 * Falls back once to the pre-multi-currency settings (usd_to_ngn_rate,
 * topup_fee_cap_kobo) when currencyConfig has never been written, carrying
 * that already-tuned rate forward as NGN's own rather than resetting it to
 * a placeholder — the same "don't re-ask a question already answered"
 * fallback src/lib/provider/config.ts uses for the provider it replaced.
 */
export async function readCurrencyConfig(): Promise<CurrencyConfigEntry[]> {
  const settings = await readSettings();
  const raw = settings[SETTING_KEYS.currencyConfig];

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const entries = parsed.flatMap((row): CurrencyConfigEntry[] => {
          if (typeof row !== "object" || row === null) return [];
          const r = row as Record<string, unknown>;
          if (typeof r.code !== "string" || !isValidCurrencyCode(r.code)) return [];
          return [
            {
              code: r.code.toUpperCase(),
              enabled: r.enabled === true,
              usdRate: typeof r.usdRate === "number" && r.usdRate > 0 ? r.usdRate : 1,
              minTopUpMinor: typeof r.minTopUpMinor === "number" ? r.minTopUpMinor : 0,
              maxTopUpMinor:
                typeof r.maxTopUpMinor === "number" ? r.maxTopUpMinor : Number.MAX_SAFE_INTEGER,
              feeCapMinor: typeof r.feeCapMinor === "number" ? r.feeCapMinor : 0,
              priority: typeof r.priority === "number" ? r.priority : 0,
              countryLabel: typeof r.countryLabel === "string" ? r.countryLabel : undefined,
            },
          ];
        });
        return normalize(entries);
      }
    } catch {
      console.error(
        `[currency] "${SETTING_KEYS.currencyConfig}" is not valid JSON; ignoring stored value.`,
      );
    }
  }

  const legacyRate = readNumber(settings, SETTING_KEYS.usdToNgnRate, DEFAULT_USD_TO_NGN_RATE);
  const legacyFeeCap = readNumber(
    settings,
    SETTING_KEYS.topupFeeCapKobo,
    DEFAULT_TOPUP_FEE_CAP_KOBO,
  );
  return normalize([{ ...NGN_DEFAULT, usdRate: legacyRate, feeCapMinor: legacyFeeCap }]);
}

export async function writeCurrencyConfig(entries: CurrencyConfigEntry[]): Promise<void> {
  await writeSetting(SETTING_KEYS.currencyConfig, JSON.stringify(entries));
}

/** Adds a new currency, or replaces an existing one with the same code
 *  entirely (used by the admin's add/edit form on /admin/currencies). */
export async function upsertCurrency(entry: CurrencyConfigEntry): Promise<void> {
  const config = await readCurrencyConfig();
  const code = entry.code.toUpperCase();
  const withoutExisting = config.filter((c) => c.code !== code);
  await writeCurrencyConfig([...withoutExisting, { ...entry, code }]);
}

/** Enables or disables one currency, leaving every other entry untouched.
 *  NGN can never be disabled: it is the one currency every pre-existing
 *  account and order was genuinely denominated in, and disabling it would
 *  strand them with no currency they can still transact in. */
export async function setCurrencyEnabled(code: string, enabled: boolean): Promise<void> {
  if (code.toUpperCase() === "NGN" && !enabled) {
    throw new Error("NGN can never be disabled.");
  }
  const config = await readCurrencyConfig();
  await writeCurrencyConfig(
    config.map((entry) => (entry.code === code.toUpperCase() ? { ...entry, enabled } : entry)),
  );
}

/** Removes a currency entirely. Refuses NGN, and refuses a currency any
 *  account is still actually denominated in: removing it would leave that
 *  account's own money with no known rate or formatting rules, which is a
 *  data-integrity risk this function will not create even at an admin's
 *  request. Disable it instead, which stops new signups from picking it
 *  without touching anyone already on it. */
export async function removeCurrency(code: string): Promise<{ removed: boolean; reason?: string }> {
  const upper = code.toUpperCase();
  if (upper === "NGN") return { removed: false, reason: "NGN can never be removed." };
  const config = await readCurrencyConfig();
  if (!config.some((c) => c.code === upper)) {
    return { removed: false, reason: "That currency is not configured." };
  }
  const accountsOnIt = await prisma.user.count({ where: { currency: upper } });
  if (accountsOnIt > 0) {
    return {
      removed: false,
      reason: `${accountsOnIt} account${accountsOnIt === 1 ? "" : "s"} still use this currency. Disable it instead.`,
    };
  }
  await writeCurrencyConfig(config.filter((c) => c.code !== upper));
  return { removed: true };
}

export async function getEnabledCurrencies(): Promise<CurrencyConfigEntry[]> {
  const config = await readCurrencyConfig();
  return config.filter((c) => c.enabled).sort((a, b) => a.priority - b.priority);
}

/** The currency anonymous/marketing pages price their illustrative
 *  examples in, and what a brand-new registration defaults its picker to:
 *  the lowest-priority enabled currency, or NGN if somehow none are
 *  enabled (should not happen; NGN is never removable from the config). */
export async function getDefaultCurrency(): Promise<CurrencyConfigEntry> {
  const enabled = await getEnabledCurrencies();
  return enabled[0] ?? NGN_DEFAULT;
}

export async function getCurrencyConfig(code: string): Promise<CurrencyConfigEntry | null> {
  const config = await readCurrencyConfig();
  return config.find((c) => c.code === code.toUpperCase()) ?? null;
}

/** Converts a USD cost into the given currency's minor unit at that
 *  currency's own admin-configured rate. The one place that conversion
 *  happens; src/lib/pricing.ts calls this before applying margin. */
export function convertUsdCentsToCurrencyMinor(
  usdCents: number,
  currencyConfig: CurrencyConfigEntry,
): number {
  const usd = usdCents / 100;
  return majorToMinor(usd * currencyConfig.usdRate, currencyConfig.code);
}
