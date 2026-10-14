import { prisma } from "@/lib/prisma";
import { readSettings, writeSetting, SETTING_KEYS } from "@/lib/settings";
import { readCurrencyConfig } from "@/lib/currency-config";
import { readFundingStates } from "@/lib/funding-config";
import { FUNDING_CURRENCY_CODES } from "@/lib/funding-currencies";
import { parseStoredRates, type StoredRates } from "@/lib/market-rates";
import { RATE_FRESH_MS, type DisplayRates } from "@/lib/display-currency";
import type { DisplayCurrencyCode } from "@/lib/currency-meta";

/**
 * Exchange rates for DISPLAY only: showing a Naira price in cedis or
 * dollars. They never decide what a customer is charged or credited (the
 * Naira rate and each funding currency's admin-approved rate do that), and a
 * customer is always told a converted figure is converted.
 *
 * Source: open.er-api.com's free daily USD table. The last good table is
 * kept in the database, so a failed fetch (outage, timeout, a malformed
 * answer) leaves the previous rates in place and marked stale once they are
 * old enough, instead of breaking the site or showing nonsense. A currency
 * with no rate at all simply cannot be chosen for display.
 */

const SOURCE_URL = "https://open.er-api.com/v6/latest/USD";
const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;

const FEED_CODES = FUNDING_CURRENCY_CODES;
const parseStored = parseStoredRates;

/** Extracts and checks the six rates from the source's answer; null when the
 *  answer is not a usable table. Exported for tests. */
export function parseRateTable(body: unknown): StoredRates["rates"] | null {
  if (!body || typeof body !== "object") return null;
  const { result, rates } = body as { result?: unknown; rates?: Record<string, unknown> };
  if (result !== "success" || !rates || typeof rates !== "object") return null;
  const out: StoredRates["rates"] = {};
  for (const code of FEED_CODES) {
    const rate = rates[code];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
    out[code] = rate;
  }
  // The market Naira rate, used when money (not a price) changes currency.
  const ngn = rates.NGN;
  if (typeof ngn === "number" && Number.isFinite(ngn) && ngn > 0) out.NGN = ngn;
  return out;
}

/**
 * Fetches a fresh table and stores it. Always records the attempt time so a
 * failing source is not hammered. Never throws.
 */
export async function refreshDisplayRates(
  options: { onlyIfDue?: boolean } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEYS.displayRates } });
  const previous = parseStored(row?.value);
  const now = new Date().toISOString();

  // Claim the refresh before fetching: the first request to flip
  // attemptedAt (a compare-and-swap on the stored value) is the only one
  // that goes on to call the source, so a burst of page views after the
  // table goes stale makes one outbound request, not dozens.
  if (options.onlyIfDue) {
    if (!isDue(previous, Date.now())) return { ok: false, reason: "not_due" };
    const claim: StoredRates = {
      fetchedAt: previous?.fetchedAt ?? new Date(0).toISOString(),
      attemptedAt: now,
      rates: previous?.rates ?? {},
    };
    try {
      if (row) {
        const claimed = await prisma.setting.updateMany({
          where: { key: SETTING_KEYS.displayRates, value: row.value },
          data: { value: JSON.stringify(claim) },
        });
        if (claimed.count !== 1) return { ok: false, reason: "claimed_elsewhere" };
      } else {
        await prisma.setting.create({ data: { key: SETTING_KEYS.displayRates, value: JSON.stringify(claim) } });
      }
    } catch {
      return { ok: false, reason: "claimed_elsewhere" };
    }
  }

  let rates: StoredRates["rates"] | null = null;
  let reason: string | undefined;
  try {
    const response = await fetch(SOURCE_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) reason = `source answered HTTP ${response.status}`;
    else rates = parseRateTable(await response.json());
    if (!rates && !reason) reason = "source answer was not a usable rate table";
  } catch (error) {
    reason = error instanceof Error ? error.message : "request failed";
  }

  const next: StoredRates = rates
    ? { fetchedAt: now, attemptedAt: now, rates }
    : { fetchedAt: previous?.fetchedAt ?? new Date(0).toISOString(), attemptedAt: now, rates: previous?.rates ?? {} };
  await writeSetting(SETTING_KEYS.displayRates, JSON.stringify(next)).catch((error) =>
    console.error("[rates] could not store display rates:", error),
  );
  if (!rates) {
    console.error(`[rates] display rate refresh failed: ${reason}`);
    return { ok: false, reason };
  }
  // With a fresh market Naira rate now stored, make good any money that was
  // converted at the pricing rate before it existed (a no-op once done).
  try {
    const { correctUnderpaidMoves } = await import("@/lib/wallet-currency");
    const corrected = await correctUnderpaidMoves();
    if (corrected > 0) console.log(`[rates] credited ${corrected} customer(s) the market-rate difference`);
  } catch (error) {
    console.error("[rates] market-rate correction failed:", error);
  }
  return { ok: true };
}

function isDue(stored: StoredRates | null, nowMs: number): boolean {
  if (!stored) return true;
  const retryOk = nowMs - new Date(stored.attemptedAt).getTime() > RETRY_AFTER_MS;
  // A table stored before the market Naira rate was kept is refreshed now.
  if (!stored.rates.NGN) return retryOk;
  return nowMs - new Date(stored.fetchedAt).getTime() > REFRESH_AFTER_MS && retryOk;
}

/** Pure part of getDisplayRates(), for tests: how stored rates, the Naira
 *  rate and any funding fallback combine. */
export function assembleRates(input: {
  ngnPerUsd: number;
  stored: StoredRates | null;
  fundingFallback: Partial<Record<DisplayCurrencyCode, number>>;
  nowMs: number;
}): DisplayRates {
  const perUsd: DisplayRates["perUsd"] = { NGN: input.ngnPerUsd, USD: 1 };
  const fetchedMs = input.stored ? new Date(input.stored.fetchedAt).getTime() : 0;
  for (const code of FEED_CODES) {
    const feed = input.stored?.rates[code];
    const fallback = input.fundingFallback[code];
    if (feed) perUsd[code] = feed;
    else if (fallback) perUsd[code] = fallback;
  }
  const usingFeed = Boolean(input.stored && Object.keys(input.stored.rates).length > 0);
  const stale = usingFeed ? input.nowMs - fetchedMs > RATE_FRESH_MS : false;
  // Naira converts to other currencies at the market rate while it is fresh,
  // so a Naira amount (a price or a balance) keeps its real value in cedis or
  // dollars. Money is only ever moved at that fresh market rate; prices fall
  // back to the platform's own rate when there is none.
  const marketNgn = input.stored?.rates.NGN;
  const freshMarketNgn = marketNgn && usingFeed && !stale ? marketNgn : undefined;
  if (freshMarketNgn) perUsd.NGN = freshMarketNgn;
  return {
    perUsd,
    ...(freshMarketNgn ? { marketNgnPerUsd: freshMarketNgn } : {}),
    asOf: usingFeed ? input.stored!.fetchedAt : null,
    stale,
  };
}

/**
 * The rates for this request. Schedules a background refresh when the
 * stored table is old (without making this request wait for it).
 */
export async function getDisplayRates(): Promise<DisplayRates> {
  // One read of the settings table for everything below.
  const settings = await readSettings();
  const [currencies, funding] = await Promise.all([
    readCurrencyConfig(settings),
    readFundingStates(settings).catch(() => null),
  ]);
  const ngn = currencies.find((c) => c.code === "NGN");
  const stored = parseStored(settings[SETTING_KEYS.displayRates]);

  const now = Date.now();
  if (isDue(stored, now)) {
    try {
      const { after } = await import("next/server");
      after(() => refreshDisplayRates({ onlyIfDue: true }));
    } catch {
      // Not inside a request (a script or test): the cron and the admin
      // refresh button are the other ways this table gets updated.
    }
  }

  const fundingFallback: Partial<Record<DisplayCurrencyCode, number>> = {};
  if (funding) {
    for (const code of FEED_CODES) {
      if (funding[code].usdRate) fundingFallback[code] = funding[code].usdRate!;
    }
  }
  return assembleRates({
    ngnPerUsd: ngn?.usdRate ?? 0,
    stored,
    fundingFallback,
    nowMs: now,
  });
}
