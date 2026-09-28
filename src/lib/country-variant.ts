import { slugify } from "@/lib/provider/country-meta";

/**
 * GrizzlySMS (and other providers in the same API family) sometimes lists
 * more than one country entry for what is really the same country,
 * distinguished only by a numbered suffix on the name it sends: "USA",
 * "USA (2)", "USA (3)". Each is a genuinely separate provider country id
 * with its own price, stock and delivery record — not a data error — so
 * this file only ever parses that naming pattern into a grouping key. It
 * does not decide which variant is better: that is
 * src/lib/country-recommendation.ts's job, using each variant's real
 * delivery history and current stock, not the "(N)" suffix itself (which on
 * its own says nothing about reliability — see that file's own comment).
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
