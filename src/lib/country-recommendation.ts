import { parseCountryVariant } from "@/lib/country-variant";
import { QUALITY_TIER_LABEL, type QualityTier } from "@/lib/deliverability";
import type { StockLevel as ProviderStockLevel } from "@/lib/provider/types";

/**
 * Deciding which of a service's country/provider-variant options
 * (`USA`, `USA (2)`, ...) to point a customer toward, and what to actually
 * tell them about each one.
 *
 * The one rule this file exists to enforce: the pick is never the cheapest,
 * never the un-suffixed "primary" name, and never a guess from the country
 * name alone. It is whichever *currently available* variant has the better
 * real delivery record — see compareForPreference() below for the exact,
 * fully transparent ordering rule, and src/lib/deliverability.ts for where
 * the delivery record itself comes from (real settled Activation rows,
 * never fabricated). A variant this is never even given (because it is
 * currently out of stock) cannot be recommended, which is what keeps an
 * old historical average from ever winning over what is actually buyable
 * right now — see getServiceCountries() in src/lib/inventory.ts, which
 * only ever passes in-stock offers here in the first place.
 *
 * One centralized function, not logic repeated per page: whatever UI shows
 * a service's country choices — today only the buy panel, but the same
 * shape would serve a homepage selector or a search results view — asks
 * this file, once, rather than re-deriving its own idea of "which one is
 * better".
 */

/** out_of_stock is deliberately excluded: nothing this file is ever given
 *  should carry it — see CountryVariantInput.stock's own comment. */
export type AvailableStockLevel = Exclude<ProviderStockLevel, "out_of_stock">;

export interface CountryVariantInput {
  /** The variant's own real slug/id — never altered or collapsed here. */
  slug: string;
  /** Exactly what the provider/catalog calls it, "(N)" suffix and all —
   *  this is the only thing parseCountryVariant() has to work out which
   *  variants belong to the same broad country. */
  name: string;
  priceKobo: number;
  /** out_of_stock is never passed in: a caller only offers what it would
   *  actually let a customer buy right now (see getServiceCountries()). */
  stock: AvailableStockLevel;
  /** 0-100, when there is a real, sufficiently-sampled rate to show — see
   *  InventoryCountry's own doc comment in src/lib/inventory.ts for exactly
   *  where this number comes from. */
  successRate?: number;
  qualityTier?: QualityTier;
  sampleSize?: number;
  /** The provider's own id for this exact variant, carried through
   *  unchanged so a caller can still purchase precisely this variant
   *  regardless of what this file recommends — see purchaseNumberAction()
   *  in src/app/dashboard/buy/actions.ts, which always buys the slug the
   *  customer actually selected. */
  providerCountryId?: string;
}

/** What to actually print next to a variant. Never a percentage unless
 *  `hasPercent` is true — see labelFor() below for exactly when that is. */
export interface DeliverabilityLabel {
  text: string;
  hasPercent: boolean;
}

export interface CountryRecommendation {
  slug: string;
  /** Grouping key only — parseCountryVariant()'s own doc comment: never a
   *  real id and never shown to a customer. */
  baseSlug: string;
  /** True for at most one variant per baseSlug group, and only when that
   *  group actually has more than one currently-available variant to
   *  choose between — recommending the sole option nothing was compared
   *  against would not mean anything. */
  recommended: boolean;
  /** Populated only on the recommended variant: why it, specifically. */
  reason: string;
  label: DeliverabilityLabel;
  availability: AvailableStockLevel;
  providerCountryId?: string;
}

export interface CountryRecommendationResult {
  bySlug: Map<string, CountryRecommendation>;
  /** Every input slug, in the order a picker should show them: variants of
   *  one country stay together with the recommended one leading its own
   *  group, and groups are still ordered cheapest-leader-first exactly as
   *  before — see the file header for why only the *within-group* order
   *  changed and not this cross-group one. */
  order: string[];
}

/**
 * Honest, non-fabricated copy for one variant.
 *
 * A real rate from enough history gets the number. Anything else gets a
 * label built only from what is actually known — current stock — plus an
 * explicit "not enough delivery data yet" so a customer never mistakes the
 * absence of a percentage for a good (or bad) one. Deliverability and
 * availability are deliberately never blended into one fabricated-sounding
 * claim like "high chance": that would imply a delivery track record this
 * variant does not have.
 */
export function labelFor(
  variant: Pick<CountryVariantInput, "successRate" | "qualityTier" | "stock">,
): DeliverabilityLabel {
  if (variant.successRate !== undefined && variant.qualityTier) {
    return {
      text: `${variant.successRate}% delivery rate · ${QUALITY_TIER_LABEL[variant.qualityTier]}`,
      hasPercent: true,
    };
  }
  return {
    text:
      variant.stock === "in_stock"
        ? "Good availability · Not enough delivery data yet"
        : "Limited availability · Not enough delivery data yet",
    hasPercent: false,
  };
}

/**
 * Orders two variants of the same broad country, best option first. Every
 * step here is a real, inspectable signal — nothing is inferred from the
 * "(N)" suffix itself beyond using it as the very last tie-break, exactly
 * the way a customer would if two options were otherwise indistinguishable.
 *
 *  1. A confirmed-low variant (see classifyQuality() in deliverability.ts)
 *     never outranks one that is not confirmed low.
 *  2. Between two variants that both have a real rate, the higher one wins.
 *  3. A variant with a real, sufficiently-sampled rate outranks one with
 *     none — a demonstrated record beats an unknown, even if the unknown
 *     happens to carry the primary, un-suffixed name.
 *  4. Neither has enough data: fall back to the primary (un-suffixed) name,
 *     the only sensible default with no real signal to go on.
 *  5. Still tied: cheaper first, same as the rest of the catalog.
 */
function compareForPreference(a: CountryVariantInput, b: CountryVariantInput): number {
  const aLow = a.qualityTier === "low";
  const bLow = b.qualityTier === "low";
  if (aLow !== bLow) return aLow ? 1 : -1;

  if (a.successRate !== undefined && b.successRate !== undefined) {
    if (a.successRate !== b.successRate) return b.successRate - a.successRate;
  } else if (a.successRate !== undefined) {
    return -1;
  } else if (b.successRate !== undefined) {
    return 1;
  }

  const aVariant = parseCountryVariant(a.name).variant;
  const bVariant = parseCountryVariant(b.name).variant;
  if (aVariant !== bVariant) return aVariant - bVariant;

  return a.priceKobo - b.priceKobo;
}

function displayCountryName(variantName: string): string {
  // Strips only the "(N)" suffix parseCountryVariant() itself recognises,
  // for copy like "the available USA options" rather than "the available
  // USA (2) options" when the leader happens to be a numbered variant.
  const { baseSlug } = parseCountryVariant(variantName);
  return variantName.replace(/\s*\(\d+\)\s*$/, "") || baseSlug;
}

/**
 * The one function every service/country picker should call: groups the
 * given currently-available variants by broad country, decides which
 * variant of each to recommend (when there is a real choice to make), and
 * returns both that decision and the display order for the whole list.
 *
 * `variants` must already be filtered to what the customer could actually
 * buy right now (see getServiceCountries()'s out_of_stock filter) — this
 * function has no way to know about, and so can never recommend, a variant
 * it was not given.
 */
export function getCountryRecommendation(
  service: { slug: string; name: string },
  variants: CountryVariantInput[],
): CountryRecommendationResult {
  const groupOf = new Map<string, CountryVariantInput[]>();
  const groupOrder: string[] = [];
  for (const variant of variants) {
    const { baseSlug } = parseCountryVariant(variant.name);
    let group = groupOf.get(baseSlug);
    if (!group) {
      group = [];
      groupOf.set(baseSlug, group);
      groupOrder.push(baseSlug);
    }
    group.push(variant);
  }

  const bySlug = new Map<string, CountryRecommendation>();
  const rankedGroups: { baseSlug: string; leaderPriceKobo: number; members: CountryVariantInput[] }[] = [];

  for (const baseSlug of groupOrder) {
    const members = [...groupOf.get(baseSlug)!].sort(compareForPreference);
    const leader = members[0];
    const hasRealChoice = members.length > 1;
    const countryName = displayCountryName(leader.name);

    for (const member of members) {
      const isLeader = member.slug === leader.slug;
      const recommended = isLeader && hasRealChoice;

      let reason = "";
      if (recommended) {
        if (leader.successRate !== undefined) {
          reason = `Highest recent delivery rate among the available ${countryName} options for ${service.name}.`;
        } else if (members.some((m) => m.qualityTier === "low")) {
          reason = `The other ${countryName} option has a confirmed low recent delivery rate; this one does not.`;
        } else {
          reason = `Default ${countryName} option — not enough delivery history yet to compare the available options.`;
        }
      }

      bySlug.set(member.slug, {
        slug: member.slug,
        baseSlug,
        recommended,
        reason,
        label: labelFor(member),
        availability: member.stock,
        providerCountryId: member.providerCountryId,
      });
    }

    rankedGroups.push({ baseSlug, leaderPriceKobo: leader.priceKobo, members });
  }

  rankedGroups.sort((a, b) => a.leaderPriceKobo - b.leaderPriceKobo);
  const order = rankedGroups.flatMap((group) => group.members.map((m) => m.slug));

  return { bySlug, order };
}
