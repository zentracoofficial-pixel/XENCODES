import { prisma } from "@/lib/prisma";
import {
  SETTING_KEYS,
  DEFAULT_GROSS_MARGIN_PERCENT,
  EXCLUSIVE_GROSS_MARGIN_PERCENT,
} from "@/lib/settings";

/**
 * The one place a customer price is derived from a supplier cost.
 *
 * Everything that shows or charges a price goes through quotePrice() here.
 * Nothing else does arithmetic on a cost, because the moment two places
 * compute a price slightly differently, one of them is eventually wrong in
 * the direction that loses money.
 *
 * MARGIN, NOT MARKUP. These are different numbers and confusing them is
 * the specific mistake this module is written to prevent:
 *
 *   markup  = profit as a share of COST   ->  price = cost x (1 + m)
 *   margin  = profit as a share of PRICE  ->  price = cost / (1 - m)
 *
 * A "50% markup" earns a 33.3% margin. Xencodes prices on margin, so a 50%
 * target means the customer pays twice the cost and half of what they pay
 * is profit. There is no multiply-by-1.5 anywhere in this file, and there
 * should never be one.
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
 * negative. Refused rather than clamped quietly so a typo in the admin
 * panel surfaces as an error instead of as a price nobody can explain.
 */
export const MAX_MARGIN_PERCENT = 95;

/**
 * Services on the exclusive tier, priced at a deliberately thinner margin.
 *
 * Kept in code rather than seeded into the database so a fresh deployment
 * already honours the commercial decision before an admin has touched
 * anything. An explicit per-service margin set in the admin panel still
 * overrides it, which is the point of the order in resolveMargin().
 */
const EXCLUSIVE_SERVICE_SLUGS = new Set(["fiverr"]);

export type PricingRuleId = "default" | "exclusive" | "service";

export interface PriceQuote {
  /** Exactly what the supplier bills Xencodes, in kobo. */
  providerCostKobo: number;
  /** What the customer pays, in kobo. Never below providerCostKobo. */
  customerPriceKobo: number;
  /** customerPriceKobo minus providerCostKobo. Never negative. */
  grossProfitKobo: number;
  /** The margin the rule asked for. */
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
  defaultPercent: number;
  exclusivePercent: number;
  /** Explicit per-service margins set by an admin. */
  serviceOverrides: Map<string, number>;
}

/** Reads every pricing rule in one pass. Safe to call once per request. */
export async function loadMarginRules(): Promise<MarginRules> {
  const [settings, serviceSettings] = await Promise.all([
    prisma.setting.findMany({
      where: {
        key: {
          in: [
            SETTING_KEYS.defaultGrossMarginPercent,
            SETTING_KEYS.exclusiveGrossMarginPercent,
          ],
        },
      },
    }),
    prisma.serviceSetting.findMany({ where: { grossMarginPercent: { not: null } } }),
  ]);

  const byKey = new Map(settings.map((row) => [row.key, Number(row.value)]));
  const read = (key: string, fallback: number) => {
    const value = byKey.get(key);
    return value !== undefined && Number.isFinite(value) ? value : fallback;
  };

  return {
    defaultPercent: read(
      SETTING_KEYS.defaultGrossMarginPercent,
      DEFAULT_GROSS_MARGIN_PERCENT,
    ),
    exclusivePercent: read(
      SETTING_KEYS.exclusiveGrossMarginPercent,
      EXCLUSIVE_GROSS_MARGIN_PERCENT,
    ),
    serviceOverrides: new Map(
      serviceSettings.flatMap((row) =>
        row.grossMarginPercent === null ? [] : [[row.slug, row.grossMarginPercent]],
      ),
    ),
  };
}

/** Most specific rule wins: an explicit per-service margin, then the
 *  exclusive tier, then the platform default. */
export function resolveMargin(
  rules: MarginRules,
  serviceSlug: string,
): { percent: number; rule: PricingRuleId; ruleLabel: string } {
  const override = rules.serviceOverrides.get(serviceSlug);
  if (override !== undefined) {
    return { percent: override, rule: "service", ruleLabel: "Service override" };
  }

  if (EXCLUSIVE_SERVICE_SLUGS.has(serviceSlug)) {
    return {
      percent: rules.exclusivePercent,
      rule: "exclusive",
      ruleLabel: "Exclusive tier",
    };
  }

  return {
    percent: rules.defaultPercent,
    rule: "default",
    ruleLabel: "Standard margin",
  };
}

export function isExclusiveService(serviceSlug: string) {
  return EXCLUSIVE_SERVICE_SLUGS.has(serviceSlug);
}

/**
 * A cost we are willing to price from.
 *
 * Checked at the boundary where a supplier's answer arrives, because a
 * cost that is missing, zero, negative or not a whole number of kobo is
 * not a cheap number, it is an unknown one. An order priced from an
 * unknown cost has an unknown margin, so there is no safe way to sell it.
 */
export function isUsableCost(costKobo: number | null | undefined): costKobo is number {
  return (
    typeof costKobo === "number" &&
    Number.isFinite(costKobo) &&
    Number.isInteger(costKobo) &&
    costKobo > 0
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
  targetMarginPercent: number,
  rule: PricingRuleId = "default",
  ruleLabel = "Standard margin",
): PriceQuote {
  if (!isUsableCost(providerCostKobo)) {
    throw new Error(`Refusing to price from an unusable cost: ${providerCostKobo}`);
  }
  if (
    !Number.isFinite(targetMarginPercent) ||
    targetMarginPercent < 0 ||
    targetMarginPercent > MAX_MARGIN_PERCENT
  ) {
    throw new Error(
      `Refusing to price at a ${targetMarginPercent}% margin, outside 0 to ${MAX_MARGIN_PERCENT}.`,
    );
  }

  // price = cost / (1 - margin). The division is the whole difference
  // between a margin and a markup.
  const exact = providerCostKobo / (1 - targetMarginPercent / 100);
  const rounded = Math.ceil(exact / PRICE_STEP_KOBO) * PRICE_STEP_KOBO;

  // With a non-negative margin this clamp never fires. It stays because a
  // rule that ever resolves to something unexpected should degrade to
  // selling at cost, which is a bad day, rather than below it, which bills
  // the business once per order.
  const customerPriceKobo = Math.max(rounded, providerCostKobo);
  const grossProfitKobo = customerPriceKobo - providerCostKobo;

  return {
    providerCostKobo,
    customerPriceKobo,
    grossProfitKobo,
    targetMarginPercent,
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
  const { percent, rule, ruleLabel } = resolveMargin(rules, serviceSlug);
  return quotePrice(providerCostKobo, percent, rule, ruleLabel);
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
