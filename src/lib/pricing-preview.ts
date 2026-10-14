import { loadMarginRules, quoteForCurrency, resolveMultiplier, type MarginRules } from "@/lib/pricing";
import { getDefaultCurrency } from "@/lib/currency-config";
import type { PricePreview } from "@/lib/price-multiplier";

/**
 * What a price change would do, worked out by the real pricing engine on a
 * few sample provider costs (in Naira, the default currency), before anyone
 * saves it. The profit rule, the NGN 500 minimum and every other rule apply
 * exactly as they would to a real number, so the "after" column is the price
 * a customer would actually see.
 */
const SAMPLE_COSTS_NGN = [200, 500, 1000, 1600, 3000, 6000];

export type PriceTarget =
  | { kind: "service"; slug: string }
  | { kind: "standard" }
  | { kind: "exclusive" };

function withMultiplier(rules: MarginRules, target: PriceTarget, multiplier: number | null): MarginRules {
  const next: MarginRules = { ...rules, serviceOverrides: new Map(rules.serviceOverrides) };
  if (target.kind === "service") {
    if (multiplier === null) next.serviceOverrides.delete(target.slug);
    else next.serviceOverrides.set(target.slug, multiplier);
  } else if (target.kind === "standard" && multiplier !== null) {
    next.defaultMultiplier = multiplier;
  } else if (target.kind === "exclusive" && multiplier !== null) {
    next.exclusiveMultiplier = multiplier;
  }
  return next;
}

function sampleSlug(target: PriceTarget) {
  // A slug no service has an override for, so the standard rule applies; the
  // exclusive tier is previewed on the exclusive service itself.
  return target.kind === "service" ? target.slug : target.kind === "exclusive" ? "fiverr" : "preview-standard";
}

export async function previewPriceChange(
  target: PriceTarget,
  newMultiplier: number | null,
): Promise<PricePreview> {
  const [rules, currency] = await Promise.all([loadMarginRules(), getDefaultCurrency()]);
  const slug = sampleSlug(target);
  const after = withMultiplier(rules, target, newMultiplier);

  const price = (r: MarginRules, costKobo: number) =>
    // A cost in kobo is usdRate kobo per USD cent, so this lands back on the
    // same cost once the engine converts it.
    quoteForCurrency(r, costKobo / currency.usdRate, slug, currency).customerPriceKobo;

  return {
    currency: currency.code,
    beforeMultiplier: resolveMultiplier(rules, slug).multiplier,
    afterMultiplier: resolveMultiplier(after, slug).multiplier,
    rows: SAMPLE_COSTS_NGN.map((ngn) => {
      const costKobo = ngn * 100;
      return { costKobo, beforeKobo: price(rules, costKobo), afterKobo: price(after, costKobo) };
    }),
  };
}
