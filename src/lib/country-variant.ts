import { slugify } from "@/lib/provider/country-meta";

/**
 * GrizzlySMS (and other providers in the same API family) sometimes lists
 * more than one country entry for what is really the same country,
 * distinguished only by a numbered suffix on the name it sends: "USA",
 * "USA (2)", "USA (3)". Each is a genuinely separate provider country id
 * with its own price and stock — not a data error — but showing them as
 * unrelated countries, ordered by nothing but price, is misleading: a
 * customer has no way to tell "USA (2)" apart from "USA" other than the
 * number, and a cheaper secondary variant could sort ahead of the primary
 * one Xencodes wants to prefer.
 *
 * Nothing here talks to the provider or changes what is for sale. It is a
 * pure display-ordering step: every row this is given comes out the other
 * side unchanged, under its own real name/slug/id, just reordered so
 * variants of the same country sit together with the primary one first.
 * There is no data from GrizzlySMS distinguishing *why* a secondary variant
 * exists (virtual vs. direct, reliability, or anything else), so none of
 * that is inferred or claimed here — only ordering, which the presence or
 * absence of a "(N)" suffix genuinely tells us.
 */

const VARIANT_SUFFIX = /^(.*\S)\s*\((\d+)\)\s*$/;

export interface CountryVariant {
  /** Slug of the name with any "(N)" suffix stripped — a grouping key
   *  only, never a country's own slug/id and never shown to a customer. */
  baseSlug: string;
  /** 1 for the plain, un-suffixed name (the primary/preferred option);
   *  N for a "(N)"-suffixed name. Lower is higher priority. */
  variant: number;
}

export function parseCountryVariant(name: string): CountryVariant {
  const match = VARIANT_SUFFIX.exec(name.trim());
  if (!match) return { baseSlug: slugify(name), variant: 1 };

  const [, baseName, suffix] = match;
  const variant = Number(suffix);
  return {
    baseSlug: slugify(baseName),
    // A malformed or zero suffix (shouldn't happen given the \d+ match, but
    // never worth trusting blindly) falls back to primary rather than
    // sorting ahead of or behind every real variant unpredictably.
    variant: Number.isFinite(variant) && variant > 0 ? variant : 1,
  };
}

/**
 * Reorders a priced country list so that, within each group of entries
 * that are variants of the same base country, the primary (un-suffixed)
 * entry always comes first — never a cheaper secondary variant, since
 * price alone must not decide priority here. Different base countries are
 * still ordered cheapest-first exactly as before, ranked by whichever of
 * their own variants is currently the most authoritative: the primary one,
 * if it is present in this list, or the cheapest available variant
 * otherwise (so a country is never pushed to the back of the list, or
 * effectively hidden, just because its primary happens to be out of stock
 * right now).
 *
 * Every input row is present exactly once in the output, under its own
 * unchanged name/slug/price: this only changes order, never contents.
 */
export function prioritizeCountryVariants<T extends { name: string; priceKobo: number }>(
  items: T[],
): T[] {
  const groups = new Map<string, T[]>();
  const groupOrder: string[] = [];

  for (const item of items) {
    const { baseSlug } = parseCountryVariant(item.name);
    let group = groups.get(baseSlug);
    if (!group) {
      group = [];
      groups.set(baseSlug, group);
      groupOrder.push(baseSlug);
    }
    group.push(item);
  }

  const ranked = groupOrder.map((baseSlug) => {
    const group = groups.get(baseSlug)!;
    group.sort((a, b) => parseCountryVariant(a.name).variant - parseCountryVariant(b.name).variant);

    const primary = group.find((item) => parseCountryVariant(item.name).variant === 1);
    const cheapest = group.reduce((min, item) => (item.priceKobo < min.priceKobo ? item : min));
    return { rankPriceKobo: (primary ?? cheapest).priceKobo, group };
  });

  ranked.sort((a, b) => a.rankPriceKobo - b.rankPriceKobo);
  return ranked.flatMap((entry) => entry.group);
}
