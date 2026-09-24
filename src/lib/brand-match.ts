import { brandIcons, type BrandIcon } from "@/data/brand-icons";

/**
 * Matches a service to a logo the way a person would recognise the brand,
 * not the way an exact string comparison does.
 *
 * brandIcons is keyed by our own slugify()'d id, but a slug is a derived,
 * unstable thing (see slugify() in src/lib/provider/country-meta.ts and
 * resolveServiceCode()'s documented fallback in
 * src/lib/provider/grizzlysms.ts): the same real brand can arrive under
 * different capitalisation, punctuation, hyphenation, or even collapsed
 * into a combined multi-brand listing ("Google/YouTube/Gmail"), and in one
 * documented degraded path the "name" (and therefore the slug) becomes the
 * provider's own short code instead of a display name at all. A flat exact
 * lookup misses all of these even when the brand is one this file already
 * has a real icon for.
 */

function canon(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const canonicalIndex = new Map<string, BrandIcon>();
for (const [key, icon] of Object.entries(brandIcons)) {
  canonicalIndex.set(canon(key), icon);
}

/**
 * A handful of short codes common across SMS-activation-style providers,
 * for the documented fallback where a service's name becomes its own raw
 * provider code. Deliberately small and only for brands already covered
 * above: this is not a guess at GrizzlySMS's full code table, which this
 * codebase never persists (see resolveServiceCode() in grizzlysms.ts).
 */
const CODE_ALIASES: Record<string, string> = {
  wa: "whatsapp",
  tg: "telegram",
  ig: "instagram",
  fb: "facebook",
  go: "google",
  ds: "discord",
  vi: "viber",
  wb: "wechat",
  ma: "mastodon",
};

// Splits a combined listing like "Google/YouTube/Gmail" or "Discord & Steam"
// into candidate brand names to try individually.
const COMBINED_NAME_SEPARATORS = /\/|,|&|\+|\bor\b|\band\b/i;

export function resolveBrandIcon(slug: string, name: string): BrandIcon | undefined {
  // Fast path: exact key, the overwhelmingly common case, and the one
  // every existing caller already relied on.
  const direct = brandIcons[slug];
  if (direct) return direct;

  const bySlug = canonicalIndex.get(canon(slug));
  if (bySlug) return bySlug;

  const byName = canonicalIndex.get(canon(name));
  if (byName) return byName;

  const aliasKey = CODE_ALIASES[slug.toLowerCase()];
  if (aliasKey) {
    const icon = brandIcons[aliasKey];
    if (icon) return icon;
  }

  for (const token of name.split(COMBINED_NAME_SEPARATORS)) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const hit = canonicalIndex.get(canon(trimmed));
    if (hit) return hit;
  }

  return undefined;
}
