import { prisma } from "@/lib/prisma";
import {
  SETTING_KEYS,
  DEFAULT_PRICE_MULTIPLIER,
  EXCLUSIVE_PRICE_MULTIPLIER,
} from "@/lib/settings";
import {
  MIN_PRICE_MULTIPLIER,
  MAX_PRICE_MULTIPLIER,
  multiplierToMarginPercent,
  marginPercentToMultiplier,
  formatMultiplier,
} from "@/lib/price-multiplier";
import {
  convertUsdCentsToCurrencyMinor,
  type CurrencyConfigEntry,
} from "@/lib/currency-config";
import { minorUnitDivisor } from "@/lib/currency";

/**
 * The one place a customer price is derived from a supplier cost.
 *
 * Everything that shows or charges a price goes through quotePrice() here.
 * Nothing else does arithmetic on a cost, because the moment two places
 * compute a price slightly differently, one of them is eventually wrong in
 * the direction that loses money.
 *
 * MULTIPLIER FIRST. A price is the provider's cost times a multiplier:
 * a 3x rule means the customer pays three times what the supplier bills.
 * That is the number an admin sets and reads. The margin percent that goes
 * with it (profit as a share of the price: 3x is 66.7%, 2x is 50%) is
 * worked out from the multiplier for display and for the order record, and
 * is never an input.
 */

/**
 * Customer prices land on whole Naira, rounded UP.
 *
 * Up, never to nearest: rounding to nearest rounds down about half the
 * time, and a price rounded below cost-plus-margin is margin given away
 * silently. The consequence is that the realised margin on an order is
 * always at least the target, never under it, which is why quotes carry
 * both figures.
 */
const PRICE_STEP_KOBO = 100;

/**
 * A margin at or above 100% is not a price, it is a division by zero or a
 * negative — price = cost / (1 - margin/100) goes to infinity exactly at
 * 100 and negative past it, not a business choice but what the formula
 * itself does. 99 is as close to "no limit" as a margin-based price can
 * get: on a ₦30 cost that is already a ₦3,000 price, a 100x multiple of
 * cost. Refused past this rather than clamped quietly, so a typo in the
 * admin panel surfaces as an error instead of as a price nobody can
 * explain.
 */
export const MAX_MARGIN_PERCENT = 99;

export {
  MIN_PRICE_MULTIPLIER,
  MAX_PRICE_MULTIPLIER,
  multiplierToMarginPercent,
  marginPercentToMultiplier,
  formatMultiplier,
};

/**
 * Services on the exclusive tier, priced at a deliberately thinner margin.
 *
 * Kept in code rather than seeded into the database so a fresh deployment
 * already honours the commercial decision before an admin has touched
 * anything. An explicit per-service margin set in the admin panel still
 * overrides it, which is the point of the order in resolveMargin().
 */
const EXCLUSIVE_SERVICE_SLUGS = new Set(["fiverr"]);

export type PricingRuleId = "default" | "exclusive" | "service" | "provider";

export interface PriceQuote {
  /** Exactly what the supplier bills Xencodes, in kobo. */
  providerCostKobo: number;
  /** What the customer pays, in kobo. Never below providerCostKobo. */
  customerPriceKobo: number;
  /** customerPriceKobo minus providerCostKobo. Never negative. */
  grossProfitKobo: number;
  /** The multiplier of cost this price works out to. For a rule price it is
   *  the rule's own multiplier; once a profit band, minimum price or fixed
   *  price has moved the price it is price divided by cost. */
  multiplier: number;
  /** The margin percent that goes with it, whole, as recorded on the order. */
  targetMarginPercent: number;
  /**
   * The margin this exact price actually earns, to one decimal place.
   * Differs from the target only by the rounding step above, and only ever
   * upward. Worth carrying separately: the target is the policy, this is
   * the outcome, and an admin reconciling an order wants the outcome.
   */
  realisedMarginPercent: number;
  /** Which rule produced the margin, recorded on the order. */
  rule: PricingRuleId;
  ruleLabel: string;
}

export interface MarginRules {
  defaultMultiplier: number;
  exclusiveMultiplier: number;
  /** Explicit per-service multipliers set by an admin. */
  serviceOverrides: Map<string, number>;
}

/** Reads every pricing rule in one pass. Safe to call once per request. */
export async function loadMarginRules(): Promise<MarginRules> {
  const [settings, serviceSettings] = await Promise.all([
    prisma.setting.findMany({
      where: {
        key: {
          in: [SETTING_KEYS.defaultPriceMultiplier, SETTING_KEYS.exclusivePriceMultiplier],
        },
      },
    }),
    prisma.serviceSetting.findMany({
      where: { OR: [{ priceMultiplier: { not: null } }, { grossMarginPercent: { not: null } }] },
    }),
  ]);

  const byKey = new Map(settings.map((row) => [row.key, Number(row.value)]));
  const read = (key: string, fallback: number) => {
    const value = byKey.get(key);
    return value !== undefined &&
      Number.isFinite(value) &&
      value >= MIN_PRICE_MULTIPLIER &&
      value <= MAX_PRICE_MULTIPLIER
      ? value
      : fallback;
  };

  return {
    defaultMultiplier: read(SETTING_KEYS.defaultPriceMultiplier, DEFAULT_PRICE_MULTIPLIER),
    exclusiveMultiplier: read(SETTING_KEYS.exclusivePriceMultiplier, EXCLUSIVE_PRICE_MULTIPLIER),
    // A service set before multipliers existed carries a margin percent
    // only; that percent is converted so its price does not move.
    serviceOverrides: new Map(
      serviceSettings.flatMap((row): [string, number][] => {
        if (row.priceMultiplier !== null) return [[row.slug, row.priceMultiplier]];
        if (row.grossMarginPercent !== null) {
          return [[row.slug, marginPercentToMultiplier(row.grossMarginPercent)]];
        }
        return [];
      }),
    ),
  };
}

/** Most specific rule wins: an explicit per-service multiplier, then the
 *  exclusive tier, then the platform default. */
export function resolveMultiplier(
  rules: MarginRules,
  serviceSlug: string,
): { multiplier: number; rule: PricingRuleId; ruleLabel: string } {
  const override = rules.serviceOverrides.get(serviceSlug);
  if (override !== undefined) {
    return { multiplier: override, rule: "service", ruleLabel: "Service override" };
  }

  if (EXCLUSIVE_SERVICE_SLUGS.has(serviceSlug)) {
    return {
      multiplier: rules.exclusiveMultiplier,
      rule: "exclusive",
      ruleLabel: "Exclusive tier",
    };
  }

  return {
    multiplier: rules.defaultMultiplier,
    rule: "default",
    ruleLabel: "Standard price",
  };
}

export function isExclusiveService(serviceSlug: string) {
  return EXCLUSIVE_SERVICE_SLUGS.has(serviceSlug);
}

/** Postgres INTEGER's own ceiling. Every minor-unit column this app writes
 *  (SyncedOffer.costUsdCents/priceKobo, Activation.providerCostKobo/priceKobo)
 *  is a 32-bit int, in both the synced-catalog cache and the live purchase
 *  path, since both eventually store whatever quotePrice() returns. */
const POSTGRES_INT4_MAX = 2_147_483_647;

/**
 * The highest cost this app will ever price from, chosen so that no
 * margin quotePrice() can apply (up to MAX_MARGIN_PERCENT) produces a
 * customer price past POSTGRES_INT4_MAX. At the loosest margin (99%),
 * price = cost / 0.01 = cost x 100, so dividing the ceiling by 100 keeps
 * every possible quote in range by construction, not by hoping a
 * supplier never sends something this large. PRICE_STEP_KOBO is
 * subtracted first as headroom for quotePrice()'s own round-up-to-the-
 * nearest-step: rounding up can add close to a full step to the exact
 * quotient, and a bound computed without that margin let a
 * ceiling-adjacent cost round up just past POSTGRES_INT4_MAX in testing.
 *
 * A real cost from a live supplier landing anywhere near this is not
 * expected: at roughly ₦1,073,741 per unit, this is already far above any
 * realistic SMS verification price. One appearing anyway (a supplier data
 * quirk, a decimal-place bug on their end, or a field this adapter
 * misread) is exactly the "unknown cost" isUsableCost() exists to refuse,
 * confirmed as a real failure mode in production: a sync attempt failed
 * outright with a raw Postgres "value out of range for type integer"
 * error on a cost this check would have instead just skipped.
 */
const MAX_USABLE_COST_KOBO = Math.floor(
  (POSTGRES_INT4_MAX - PRICE_STEP_KOBO) / (100 / (100 - MAX_MARGIN_PERCENT)),
);

/**
 * A cost we are willing to price from.
 *
 * Checked at the boundary where a supplier's answer arrives, because a
 * cost that is missing, zero, negative, not a whole number of kobo, or
 * large enough to overflow the database column a price is eventually
 * stored in, is not a cheap number, it is an unknown one. An order priced
 * from an unknown cost has an unknown margin, so there is no safe way to
 * sell it.
 */
export function isUsableCost(costKobo: number | null | undefined): costKobo is number {
  return (
    typeof costKobo === "number" &&
    Number.isFinite(costKobo) &&
    Number.isInteger(costKobo) &&
    costKobo > 0 &&
    costKobo <= MAX_USABLE_COST_KOBO
  );
}

/**
 * The same sanity check as isUsableCost(), applied to a provider's raw USD
 * cost before it is ever converted into a customer's own currency. No real
 * SMS-verification number costs anywhere near this; one reported anyway is
 * exactly the "unknown cost" case worth refusing rather than converting and
 * charging margin on. Independent of which currency it will become: a
 * garbage USD figure is garbage before any exchange rate is applied to it.
 */
const MAX_USABLE_COST_USD_CENTS = 100_000; // $1,000

export function isUsableUsdCost(usdCents: number | null | undefined): usdCents is number {
  return (
    typeof usdCents === "number" &&
    Number.isFinite(usdCents) &&
    Number.isInteger(usdCents) &&
    usdCents > 0 &&
    usdCents <= MAX_USABLE_COST_USD_CENTS
  );
}

/**
 * Turns a supplier cost into what a customer pays.
 *
 * Throws on an unusable cost or an impossible margin rather than returning
 * a number nobody can stand behind. Callers validate with isUsableCost()
 * first and refuse the sale; reaching the throw means a bug upstream, and
 * a loud failure is better than a quiet sale at the wrong price.
 */
export function quotePrice(
  providerCostKobo: number,
  multiplier: number,
  rule: PricingRuleId = "default",
  ruleLabel = "Standard price",
): PriceQuote {
  if (!isUsableCost(providerCostKobo)) {
    throw new Error(`Refusing to price from an unusable cost: ${providerCostKobo}`);
  }
  if (
    !Number.isFinite(multiplier) ||
    multiplier < MIN_PRICE_MULTIPLIER ||
    multiplier > MAX_PRICE_MULTIPLIER
  ) {
    throw new Error(
      `Refusing to price at ${multiplier}x the cost, outside ${MIN_PRICE_MULTIPLIER}x to ${MAX_PRICE_MULTIPLIER}x.`,
    );
  }

  // price = cost x multiplier, rounded up to the step. The small epsilon
  // keeps a product that is mathematically exact from being pushed up a
  // step by floating point.
  const exact = providerCostKobo * multiplier;
  const rounded = Math.ceil(exact / PRICE_STEP_KOBO - 1e-9) * PRICE_STEP_KOBO;

  // With a multiplier of at least 1 this clamp never fires. It stays because
  // a rule that ever resolves to something unexpected should degrade to
  // selling at cost, which is a bad day, rather than below it, which bills
  // the business once per order.
  const customerPriceKobo = Math.max(rounded, providerCostKobo);
  const grossProfitKobo = customerPriceKobo - providerCostKobo;

  return {
    providerCostKobo,
    customerPriceKobo,
    grossProfitKobo,
    multiplier,
    targetMarginPercent: Math.round((1 - 1 / multiplier) * 100),
    realisedMarginPercent:
      Math.round((grossProfitKobo / customerPriceKobo) * 1000) / 10,
    rule,
    ruleLabel,
  };
}

/** The common case: resolve the rule for a service, then apply it. */
export function quoteFor(
  rules: MarginRules,
  providerCostKobo: number,
  serviceSlug: string,
): PriceQuote {
  const { multiplier, rule, ruleLabel } = resolveMultiplier(rules, serviceSlug);
  return quotePrice(providerCostKobo, multiplier, rule, ruleLabel);
}

/**
 * The multi-currency entry point: converts a provider's raw USD cost into
 * one specific currency at that currency's own admin-configured rate, then
 * prices it exactly the way quoteFor() always has. This is the only place
 * a USD cost and a target currency ever meet; quotePrice() itself never
 * hears about USD or exchange rates at all, only a cost already expressed
 * in the currency it is pricing for.
 */
export function quoteForCurrency(
  rules: MarginRules,
  usdCents: number,
  serviceSlug: string,
  currency: CurrencyConfigEntry,
): PriceQuote {
  return withMinimumPrice(quoteBeforeMinimum(rules, usdCents, serviceSlug, currency), minimumPriceKobo(serviceSlug, null), currency);
}

/**
 * quoteForCurrency() for one specific country of a service, with that
 * country's own minimum price as well (see minimumPriceKobo()). Every price
 * shown or charged for a service and country pair goes through this.
 */
export function quoteForPair(
  rules: MarginRules,
  usdCents: number,
  serviceSlug: string,
  countrySlug: string,
  currency: CurrencyConfigEntry,
): PriceQuote {
  return withMinimumPrice(
    quoteBeforeMinimum(rules, usdCents, serviceSlug, currency),
    minimumPriceKobo(serviceSlug, countrySlug),
    currency,
  );
}

/**
 * Providers whose numbers are priced at a fixed multiple of their own cost,
 * set by the owner, instead of the platform's margin rules. Server II
 * (DogeSMS) sells at 3.5x what it bills, in every currency: the cost is
 * converted into the currency being priced (Naira at the market rate, the
 * one a Naira price is shown at in dollars, not the platform's pricing
 * rate) and multiplied, and the result is
 * rounded up only to the smallest step that currency is shown in (NGN 1, or
 * 1 cent), not to the whole-unit step the margin rules use, so the price
 * stays 3.5x the cost. The owner's minimum prices (NGN 500, TikTok NGN 750,
 * UK NGN 1,000) still apply on top. No profit band, repeat-listing price or
 * fixed pair price is applied to these.
 */
export const PROVIDER_COST_MULTIPLIERS: Readonly<Record<string, number>> = {
  dogesms: 3.5,
};

/** The fixed multiple of cost a provider is priced at, if it has one. */
export function providerCostMultiplier(providerId: string): number | undefined {
  return PROVIDER_COST_MULTIPLIERS[providerId];
}

/**
 * The price of a number from one specific provider: its fixed multiple of
 * cost when it has one (see PROVIDER_COST_MULTIPLIERS), otherwise the
 * platform rules exactly as quoteForPair() / quoteForCurrency() apply them.
 * Pass a country to include that country's minimum price.
 */
export function quoteForProvider(
  rules: MarginRules,
  providerId: string,
  usdCents: number,
  serviceSlug: string,
  countrySlug: string | null,
  currency: CurrencyConfigEntry,
): PriceQuote {
  const multiplier = PROVIDER_COST_MULTIPLIERS[providerId];
  if (multiplier === undefined) {
    return countrySlug === null
      ? quoteForCurrency(rules, usdCents, serviceSlug, currency)
      : quoteForPair(rules, usdCents, serviceSlug, countrySlug, currency);
  }
  // Naira at the rate a Naira price is shown in other currencies (the
  // market rate while fresh), so the price is 3.5x the cost in Naira and
  // still 3.5x it once shown or charged in dollars.
  const ratePerUsd = currency.code === "NGN" ? (currency.ngnPerUsd ?? currency.usdRate) : currency.usdRate;
  const costMinor = Math.round((usdCents / 100) * ratePerUsd * minorUnitDivisor(currency.code));
  if (!isUsableCost(costMinor)) {
    throw new Error(`Refusing to price from an unusable cost: ${costMinor}`);
  }
  // NGN 1 for Naira, as every Naira price; one minor unit (a cent) for any
  // other currency, so a small dollar price is not pushed up to a whole
  // dollar and away from 3.5x.
  const step = currency.code === "NGN" ? PRICE_STEP_KOBO : 1;
  const exact = costMinor * multiplier;
  const customerPriceKobo = Math.max(Math.ceil(exact / step - 1e-9) * step, costMinor);
  const grossProfitKobo = customerPriceKobo - costMinor;
  const quote: PriceQuote = {
    providerCostKobo: costMinor,
    customerPriceKobo,
    grossProfitKobo,
    multiplier,
    targetMarginPercent: Math.round((1 - 1 / multiplier) * 100),
    realisedMarginPercent: realisedMargin(customerPriceKobo, costMinor),
    rule: "provider",
    ruleLabel: `Server price, ${formatMultiplier(multiplier)} cost`,
  };
  return withMinimumPrice(quote, minimumPriceKobo(serviceSlug, countrySlug), currency);
}

/**
 * Higher minimum prices, set by the owner, in kobo. A service's minimum
 * applies in every country, a country's to every service, and where both
 * apply the higher one wins. A repeat listing ("United Kingdom (2)") counts
 * as its country.
 */
export const SERVICE_MIN_PRICE_KOBO: Readonly<Record<string, number>> = {
  tiktok: 75_000, // NGN 750
};
export const COUNTRY_MIN_PRICE_KOBO: Readonly<Record<string, number>> = {
  "united-kingdom": 100_000, // NGN 1,000
  uk: 100_000,
  england: 100_000,
};

/**
 * The minimum price in the currency being priced, in its minor unit. Naira
 * uses the minimum as it is. Another currency gets the raised service and
 * country minimums (not the general NGN 500 one) converted at the Naira rate
 * carried on its config and rounded up to a price step, as every price is,
 * so "TikTok from NGN 750" is the same floor for a US dollar account and
 * moves with the daily rate. No rate, no minimum.
 */
export function minimumPriceInCurrency(minimumKobo: number, currency: CurrencyConfigEntry): number {
  if (currency.code === "NGN") return minimumKobo;
  if (minimumKobo <= MIN_PRICE_KOBO || !currency.ngnPerUsd || !(currency.ngnPerUsd > 0)) return 0;
  const usd = minimumKobo / 100 / currency.ngnPerUsd;
  const exact = usd * currency.usdRate * minorUnitDivisor(currency.code);
  return Math.ceil(exact / PRICE_STEP_KOBO - 1e-9) * PRICE_STEP_KOBO;
}

/** The lowest NGN price for this service, in this country when one is given. */
export function minimumPriceKobo(serviceSlug: string, countrySlug: string | null): number {
  const baseCountry = countrySlug?.replace(/-\d+$/, "") ?? null;
  return Math.max(
    MIN_PRICE_KOBO,
    SERVICE_MIN_PRICE_KOBO[serviceSlug] ?? 0,
    baseCountry ? (COUNTRY_MIN_PRICE_KOBO[baseCountry] ?? 0) : 0,
  );
}

/**
 * Naira only: nothing is sold for less than its minimum (NGN 500, or a
 * higher one set for the service or country). A number whose price comes
 * out lower is sold at the minimum, so the profit on it is the minimum less
 * its cost. Prices already at or above it are returned as they are. Applies
 * to every service, the exclusive tier included.
 */
function withMinimumPrice(quote: PriceQuote, minimumKobo: number, currency: CurrencyConfigEntry): PriceQuote {
  const minimum = minimumPriceInCurrency(minimumKobo, currency);
  if (minimum <= 0 || quote.customerPriceKobo >= minimum) return quote;
  return restate(quote, minimum, `${quote.ruleLabel}, minimum price`);
}

/**
 * A repeat listing of a country ("USA (2)", "Canada (2)") is priced from the
 * plain listing's price for the same service: half of it, but never below
 * NGN 1,800 or above NGN 3,500, and never more than the plain listing itself.
 * So the dearer the real number is, the more its repeat listing costs, inside
 * that band. Those listings are separate seller pools of the same country
 * and are kept in a fixed relation to the main one instead of floating with
 * the supplier's price for them.
 */
export const VARIANT_PRICE_SHARE_PERCENT = 50;
export const VARIANT_MIN_PRICE_KOBO = 180_000;
export const VARIANT_MAX_PRICE_KOBO = 350_000;

/** What a repeat listing sells for, given the plain listing's price. */
export function variantPriceKobo(basePriceKobo: number, currency: CurrencyConfigEntry): number {
  const share = Math.round((basePriceKobo * VARIANT_PRICE_SHARE_PERCENT) / 100 / PRICE_STEP_KOBO) * PRICE_STEP_KOBO;
  // The band is an amount of Naira; another currency just takes the share.
  const banded =
    currency.code === "NGN"
      ? Math.min(Math.max(share, VARIANT_MIN_PRICE_KOBO), VARIANT_MAX_PRICE_KOBO)
      : share;
  // A repeat listing is never dearer than the plain one.
  return Math.min(banded, basePriceKobo);
}

/**
 * Fixed customer prices for specific service and country pairs, in kobo,
 * keyed "serviceSlug:countrySlug". A pair listed here sells at exactly this
 * price (NGN accounts only) instead of the margin or repeat-listing rule,
 * except that it is never set below what the supplier bills. Remove a line
 * to put the pair back on the normal rules.
 */
export const PAIR_PRICE_OVERRIDES_KOBO: Readonly<Record<string, number>> = {
  // WhatsApp USA (2), set by the owner.
  "whatsapp:usa-2": 245_000,
};

/** The fixed price for this pair, if it has one for this currency. */
export function pairPriceOverrideKobo(
  serviceSlug: string,
  countrySlug: string,
  currency: CurrencyConfigEntry,
): number | undefined {
  if (currency.code !== "NGN") return undefined;
  return PAIR_PRICE_OVERRIDES_KOBO[`${serviceSlug}:${countrySlug}`];
}

/**
 * Sets a quote to a fixed price, up or down. The supplier's own price for
 * the number (and the NGN 500 minimum) is still respected: the price is
 * never set below what the supplier bills, so a repeat listing whose own
 * cost is above the target sells at cost rather than at a loss.
 */
export function setQuoteToPrice(
  quote: PriceQuote,
  targetKobo: number,
  currency: CurrencyConfigEntry,
): PriceQuote {
  const floor = Math.max(quote.providerCostKobo, currency.code === "NGN" ? MIN_PRICE_KOBO : 0);
  const price = Math.max(targetKobo, floor);
  if (price === quote.customerPriceKobo) return quote;
  return restate(quote, price, `${quote.ruleLabel}, repeat listing price`);
}

/** The lowest price anything is sold for (NGN 500), in kobo. */
export const MIN_PRICE_KOBO = 50_000;

function quoteBeforeMinimum(
  rules: MarginRules,
  usdCents: number,
  serviceSlug: string,
  currency: CurrencyConfigEntry,
): PriceQuote {
  const costMinor = convertUsdCentsToCurrencyMinor(usdCents, currency);
  const standard = quoteFor(rules, costMinor, serviceSlug);

  // Naira only: the cap below is an amount of money, not a percentage.
  // The exclusive tier (Fiverr) is a deliberately thin margin and is left
  // alone. A number whose standard profit is already at or under the cap
  // is priced exactly as it always was.
  const multiplier = standard.multiplier;
  if (
    currency.code !== "NGN" ||
    standard.rule === "exclusive" ||
    multiplier <= 1 ||
    standard.grossProfitKobo <= MAX_PROFIT_KOBO
  ) {
    return standard;
  }

  // An expensive number: profit is held down instead of the full margin on a
  // large cost. The price stays where it was for the dearest number still at
  // the cap, until cost + TARGET_PROFIT_KOBO is higher, then follows that. So a dearer number is never cheaper than a
  // cheaper one, never below cost, and never above the standard price.
  // The cost at which the standard profit is exactly the cap: profit is
  // cost x (multiplier - 1).
  const capCostMinor = Math.floor(MAX_PROFIT_KOBO / (multiplier - 1));
  const priceAtCap = quotePrice(capCostMinor, multiplier).customerPriceKobo;
  const targetPrice = Math.ceil((costMinor + TARGET_PROFIT_KOBO) / PRICE_STEP_KOBO) * PRICE_STEP_KOBO;
  const banded = Math.max(priceAtCap, targetPrice, costMinor);
  if (banded >= standard.customerPriceKobo) return standard;

  return restate(standard, banded, `${standard.ruleLabel}, profit held down on expensive numbers`);
}

/** The most profit (in kobo, NGN 5,000) a number earns at the standard
 *  margin before it counts as expensive. A number whose standard profit is
 *  at or under this is priced exactly as it always was. */
export const MAX_PROFIT_KOBO = 500_000;

/** Once a number is expensive, its profit is held down toward this
 *  (NGN 3,500) instead of the full margin on a large cost. */
export const TARGET_PROFIT_KOBO = 350_000;

/** A quote whose price was moved by a band, the minimum or a fixed price:
 *  the multiplier and margin are restated from the price actually charged. */
function restate(quote: PriceQuote, priceKobo: number, ruleLabel: string): PriceQuote {
  const margin = realisedMargin(priceKobo, quote.providerCostKobo);
  return {
    ...quote,
    customerPriceKobo: priceKobo,
    grossProfitKobo: priceKobo - quote.providerCostKobo,
    multiplier:
      quote.providerCostKobo > 0
        ? Math.round((priceKobo / quote.providerCostKobo) * 100) / 100
        : quote.multiplier,
    targetMarginPercent: Math.round(margin),
    realisedMarginPercent: margin,
    ruleLabel,
  };
}

/** Margin actually earned on a stored order, from the two exact figures
 *  recorded at purchase. Used by the admin rather than a stored duplicate,
 *  which could disagree with the money. */
export function realisedMargin(customerPriceKobo: number, providerCostKobo: number) {
  if (customerPriceKobo <= 0) return 0;
  return (
    Math.round(((customerPriceKobo - providerCostKobo) / customerPriceKobo) * 1000) / 10
  );
}
