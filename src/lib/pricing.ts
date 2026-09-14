import { prisma } from "@/lib/prisma";
import { SETTING_KEYS, DEFAULT_GLOBAL_MARKUP_PERCENT } from "@/lib/settings";

/**
 * The one place a customer price is derived from a provider cost.
 *
 * Everything that shows or charges a price (homepage, /buy, the purchase
 * action, admin) goes through quotePrice() here. Nothing else is allowed
 * to do its own arithmetic on a cost, because the moment two places
 * compute a price slightly differently, one of them is eventually wrong in
 * the direction that loses money.
 *
 * The rule this module exists to enforce: a customer is never quoted or
 * charged less than the provider cost the quote was built from.
 */

/** Customer prices land on tidy 5 Naira steps. Costs never do. */
const PRICE_STEP_KOBO = 500;

export interface PriceQuote {
  /** Exactly what the provider bills Xencodes, in kobo. */
  providerCostKobo: number;
  /** The percent actually applied, after resolving all the rules below. */
  markupPercent: number;
  /** customerPriceKobo minus providerCostKobo. Never negative. */
  markupKobo: number;
  /** What the customer pays, in kobo. Never below providerCostKobo. */
  customerPriceKobo: number;
}

/**
 * Everything needed to resolve a markup, read once and passed around, so
 * pricing a list of countries is not a database round trip per row.
 *
 * Shaped for the rules that exist now (global, per category, per service)
 * plus the two the admin panel should be able to grow into without a
 * rewrite: per country, and per service and country together. The
 * resolution order in resolveMarkupPercent() is already written for all
 * five, so adding one later is a matter of populating its map.
 */
export interface MarkupRules {
  globalPercent: number;
  categoryBonus: Record<string, number>;
  serviceOverrides: Map<string, number>;
  countryOverrides: Map<string, number>;
  serviceCountryOverrides: Map<string, number>;
}

/**
 * A starting per-category bonus stacked on the global percent, applied
 * only until an admin sets an explicit per-service value.
 *
 * Not derived from live cost data: there is no way to know every
 * service's real cost without pricing the entire catalog, which is
 * exactly what the bounded eager pass avoids. It is a defensible starting
 * heuristic instead. More margin on identity-critical categories a
 * customer needs urgently and shops around for less, a smaller bump where
 * there is some urgency but more alternatives, none on commodity
 * categories where staying competitive matters more.
 */
const CATEGORY_MARKUP_BONUS: Record<string, number> = {
  "Social & Messaging": 10,
  "Finance & Crypto": 10,
  Dating: 5,
  "Marketplaces & Freelance": 5,
  "Developer & Cloud": 5,
  Entertainment: 0,
  "Travel & Delivery": 0,
  Other: 0,
};

export function defaultServiceMarkupBonus(category: string) {
  return CATEGORY_MARKUP_BONUS[category] ?? 0;
}

function key(serviceSlug: string, countrySlug: string) {
  return `${serviceSlug}::${countrySlug}`;
}

/** Reads every markup rule in one pass. Safe to call per request. */
export async function loadMarkupRules(): Promise<MarkupRules> {
  const [markupRow, serviceSettings] = await Promise.all([
    prisma.setting.findUnique({ where: { key: SETTING_KEYS.globalMarkupPercent } }),
    prisma.serviceSetting.findMany(),
  ]);

  // No row yet means no admin has ever set this, so apply the starting
  // default rather than accidentally selling at cost. Once a row exists,
  // even "0", it always wins.
  const globalPercent = markupRow
    ? Number(markupRow.value) || 0
    : DEFAULT_GLOBAL_MARKUP_PERCENT;

  return {
    globalPercent,
    categoryBonus: CATEGORY_MARKUP_BONUS,
    serviceOverrides: new Map(
      serviceSettings
        .filter((row) => row.markupPercent !== 0)
        .map((row) => [row.slug, row.markupPercent]),
    ),
    // Not configurable yet. Present so resolveMarkupPercent() already has
    // the shape for them and the admin panel can fill them in later.
    countryOverrides: new Map(),
    serviceCountryOverrides: new Map(),
  };
}

/**
 * Most specific rule wins: service and country together, then country,
 * then service, then the category bonus, all on top of the global
 * percent. A rule that exists replaces the category bonus rather than
 * stacking with it, so an admin who types a number gets exactly that
 * number of extra margin, not that number plus a bonus they cannot see.
 */
export function resolveMarkupPercent(
  rules: MarkupRules,
  target: { serviceSlug: string; countrySlug?: string; category?: string },
): number {
  const { serviceSlug, countrySlug, category } = target;

  const specific =
    (countrySlug !== undefined
      ? rules.serviceCountryOverrides.get(key(serviceSlug, countrySlug))
      : undefined) ??
    (countrySlug !== undefined ? rules.countryOverrides.get(countrySlug) : undefined) ??
    rules.serviceOverrides.get(serviceSlug) ??
    (category !== undefined ? defaultServiceMarkupBonus(category) : 0);

  return rules.globalPercent + specific;
}

/**
 * Turns a provider cost into what a customer pays.
 *
 * Two guarantees, in this order:
 *
 * 1. The price is rounded UP to the next 5 Naira, never down. Rounding a
 *    price to the nearest step rounds down about half the time, and a
 *    price rounded below cost plus markup is margin given away silently.
 * 2. The result is then clamped to at least the provider cost. With a
 *    positive markup that clamp never fires, but it means a misconfigured
 *    0% or negative markup degrades to selling at cost rather than below
 *    it. Selling at cost is a bad day. Selling below cost is a bug that
 *    bills the business per order.
 */
export function quotePrice(
  providerCostKobo: number,
  markupPercent: number,
): PriceQuote {
  const withMarkup = (providerCostKobo * (100 + markupPercent)) / 100;
  const rounded = Math.ceil(withMarkup / PRICE_STEP_KOBO) * PRICE_STEP_KOBO;
  const customerPriceKobo = Math.max(rounded, providerCostKobo);

  return {
    providerCostKobo,
    markupPercent,
    markupKobo: customerPriceKobo - providerCostKobo,
    customerPriceKobo,
  };
}

/** Convenience for the common case: resolve the rule, then apply it. */
export function quoteFor(
  rules: MarkupRules,
  providerCostKobo: number,
  target: { serviceSlug: string; countrySlug?: string; category?: string },
): PriceQuote {
  return quotePrice(providerCostKobo, resolveMarkupPercent(rules, target));
}
