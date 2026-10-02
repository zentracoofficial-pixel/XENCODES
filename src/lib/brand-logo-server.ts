import "server-only";
import * as simpleIcons from "simple-icons";
import iconsMeta from "simple-icons/icons.json";
import type { BrandIcon } from "@/data/brand-icons";
import { matchBrand, resolveBrandIcon, canon } from "@/lib/brand-match";

/**
 * Logos for the long tail of the catalogue: every service the curated set
 * in src/data/brand-icons.ts doesn't cover, matched against the full
 * Simple Icons set (CC0 1.0, ~3,400 brands) using the exact same rules as
 * resolveBrandIcon(). Server-only so the full set never ships to the
 * browser; /api/service-logo/[slug] serves the result as one cached SVG.
 *
 * Brand names and marks are trademarks of their respective owners;
 * Xencodes is not affiliated with them. Shown only to identify which
 * service a number is for.
 */

interface SimpleIcon {
  slug: string;
  path: string;
  hex: string;
}

interface IconMeta {
  title: string;
  slug: string;
  aliases?: {
    aka?: string[];
    dup?: { title: string }[];
    loc?: Record<string, string>;
  };
}

/**
 * Three-letter Simple Icons names that are unambiguous consumer brands.
 * Every other three-letter key is skipped: the set is full of developer
 * tools and plain words (Arc, Box, Gin, Kit, Red, "bat" the crypto token)
 * that would otherwise put a wrong logo on an unrelated service that
 * happens to share the name. A lettermark is better than a wrong logo.
 */
const THREE_LETTER_BRANDS = new Set([
  "amd", "att", "bmw", "bvg", "cnn", "dhl", "dji", "dpd", "edx", "fox", "g2a", "g2g",
  "gmx", "hbo", "htc", "icq", "ign", "jbl", "jcb", "jio", "kfc", "kia", "kik", "klm",
  "max", "mlb", "msi", "n26", "nba", "nhl", "obb", "okx", "oyo", "sky", "ted", "ton",
  "ufc", "ups", "wix", "wwe", "xrp",
]);

function buildIndex(): Map<string, BrandIcon> {
  const bySlug = new Map<string, SimpleIcon>();
  for (const value of Object.values(simpleIcons) as unknown[]) {
    if (
      typeof value === "object" &&
      value !== null &&
      "slug" in value &&
      "path" in value &&
      "hex" in value
    ) {
      const icon = value as SimpleIcon;
      bySlug.set(icon.slug, icon);
    }
  }

  const index = new Map<string, BrandIcon>();
  const meta = (Array.isArray(iconsMeta) ? iconsMeta : []) as IconMeta[];
  for (const entry of meta) {
    const icon = bySlug.get(entry.slug);
    if (!icon) continue;
    const brand: BrandIcon = { hex: `#${icon.hex}`, path: icon.path };
    const names = [
      entry.title,
      entry.slug,
      ...(entry.aliases?.aka ?? []),
      ...(entry.aliases?.dup ?? []).map((dup) => dup.title),
      ...Object.values(entry.aliases?.loc ?? {}),
    ];
    for (const name of names) {
      const key = canon(name);
      // Short keys collide with unrelated service names far more often than
      // they match the right brand (see THREE_LETTER_BRANDS); first title
      // wins on ties.
      if (key.length < 3 || (key.length === 3 && !THREE_LETTER_BRANDS.has(key))) continue;
      if (index.has(key)) continue;
      index.set(key, brand);
    }
  }
  return index;
}

let cachedIndex: Map<string, BrandIcon> | undefined;

/** The curated icon when there is one (it carries hand-checked paths for a
 *  few brands Simple Icons withdrew), otherwise the Simple Icons match. */
export function resolveServiceLogo(slug: string, name: string): BrandIcon | undefined {
  const curated = resolveBrandIcon(slug, name);
  if (curated) return curated;

  cachedIndex ??= buildIndex();
  const index = cachedIndex;
  return matchBrand((key) => index.get(key), slug, name);
}
