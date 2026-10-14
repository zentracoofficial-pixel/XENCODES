import { SETTING_KEYS } from "@/lib/settings";
import { RATE_FRESH_MS } from "@/lib/display-currency";
import { FUNDING_CURRENCY_CODES, type FundingCurrencyCode } from "@/lib/funding-currencies";
import type { DisplayCurrencyCode } from "@/lib/currency-meta";

/**
 * The stored market rate table (units per 1 USD), as kept fresh by
 * src/lib/exchange-rates.ts. Parsing lives here, apart from the fetching, so
 * the funding code can read market rates without importing the display-rate
 * machinery (which itself reads the funding settings).
 */

export interface StoredRates {
  fetchedAt: string;
  attemptedAt: string;
  rates: Partial<Record<DisplayCurrencyCode, number>>;
}

export function parseStoredRates(raw: string | undefined): StoredRates | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredRates;
    if (!value || typeof value !== "object" || typeof value.fetchedAt !== "string") return null;
    const rates: StoredRates["rates"] = {};
    for (const code of FUNDING_CURRENCY_CODES) {
      const rate = (value.rates as Record<string, unknown> | undefined)?.[code];
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) rates[code] = rate;
    }
    return {
      fetchedAt: value.fetchedAt,
      attemptedAt: typeof value.attemptedAt === "string" ? value.attemptedAt : value.fetchedAt,
      rates,
    };
  } catch {
    return null;
  }
}

/**
 * Market rates fresh enough to move money with: the stored table only when
 * it was fetched within the freshness window. An old table returns nothing,
 * so a currency that follows the market is refused rather than credited at a
 * rate that may have moved.
 */
export function freshMarketRates(
  settings: Record<string, string>,
  nowMs: number = Date.now(),
): Partial<Record<FundingCurrencyCode, number>> {
  const stored = parseStoredRates(settings[SETTING_KEYS.displayRates]);
  if (!stored) return {};
  const age = nowMs - new Date(stored.fetchedAt).getTime();
  if (!(age >= 0 && age <= RATE_FRESH_MS)) return {};
  return stored.rates as Partial<Record<FundingCurrencyCode, number>>;
}
