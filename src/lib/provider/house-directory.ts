import { prisma } from "@/lib/prisma";
import { resolveIso2 } from "./country-meta";

/**
 * Keeps every supplier selling under one listing per country and service.
 *
 * A country's and a service's slug come from the supplier's own name for it
 * (see resolveCountryMeta()), and suppliers name things differently: one
 * calls the United States "USA" (slug "usa"), another "United States". Left
 * alone, the same country would be listed twice and the two suppliers could
 * never be compared for it, which is the whole point of Smart Pickup.
 *
 * GrizzlySMS (Server I) is the house naming: its slugs are already in every
 * URL, cached offer and past order. Another supplier's country is matched to
 * the house slug of the same ISO country, and its service to the house slug
 * of the same service, when there is a clear match; otherwise it keeps its
 * own slug and is simply listed on its own.
 */

export const HOUSE_PROVIDER_ID = "grizzlysms";

export interface HouseDirectory {
  /** ISO alpha-2 code -> the house slug for that country. */
  countrySlugByIso2: Map<string, string>;
  /** Every house service slug. */
  serviceSlugs: Set<string>;
}

const TTL_MS = 30 * 60 * 1000;
let cached: { value: HouseDirectory; at: number } | null = null;

/** Built from the house supplier's synced catalog. Empty (never wrong)
 *  before the first sync. */
export async function loadHouseDirectory(): Promise<HouseDirectory> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const [countries, services] = await Promise.all([
    prisma.syncedOffer.findMany({
      where: { providerId: HOUSE_PROVIDER_ID },
      distinct: ["countrySlug"],
      select: { countrySlug: true, countryName: true },
    }),
    prisma.syncedOffer.findMany({
      where: { providerId: HOUSE_PROVIDER_ID },
      distinct: ["serviceSlug"],
      select: { serviceSlug: true },
    }),
  ]);
  const value = buildHouseDirectory(
    countries.map((row) => ({ slug: row.countrySlug, name: row.countryName })),
    services.map((row) => row.serviceSlug),
  );
  cached = { value, at: Date.now() };
  return value;
}

/** Pure part of loadHouseDirectory(), for tests. A repeat listing
 *  ("USA (2)") is never the country's house slug. */
export function buildHouseDirectory(
  countries: Array<{ slug: string; name: string }>,
  serviceSlugs: string[],
): HouseDirectory {
  const countrySlugByIso2 = new Map<string, string>();
  for (const { slug, name } of countries) {
    if (/\(\d+\)\s*$/.test(name)) continue;
    const iso2 = resolveIso2(name);
    if (iso2 && !countrySlugByIso2.has(iso2)) countrySlugByIso2.set(iso2, slug);
  }
  return { countrySlugByIso2, serviceSlugs: new Set(serviceSlugs) };
}

/** The house slug for a country, by its ISO code, else the supplier's own. */
export function houseCountrySlug(iso2: string | null, ownSlug: string, directory: HouseDirectory): string {
  return (iso2 && directory.countrySlugByIso2.get(iso2.toUpperCase())) || ownSlug;
}

/** Where the house lists a brand under a combined name. */
const SERVICE_ALIASES: Record<string, string[]> = {
  google: ["google-gmail-youtube"],
  gmail: ["google-gmail-youtube"],
  youtube: ["google-gmail-youtube"],
  instagram: ["instagram-threads"],
  threads: ["instagram-threads"],
  microsoft: ["microsoft-outlook"],
  outlook: ["microsoft-outlook"],
  hotmail: ["microsoft-outlook"],
  twitter: ["twitter-x"],
  x: ["twitter-x"],
  line: ["line-messenger"],
  wechat: ["wechat"],
  "whats-app": ["whatsapp"],
  fb: ["facebook"],
};

/**
 * The house slug for a service: the same slug when the house has it, or a
 * known combined listing ("instagram" -> "instagram-threads"). Anything else
 * keeps its own slug and is listed on its own: guessing ("uber" ->
 * "uber-eats") could sell a number for the wrong app.
 */
export function houseServiceSlug(ownSlug: string, directory: HouseDirectory): string {
  if (directory.serviceSlugs.size === 0 || directory.serviceSlugs.has(ownSlug)) return ownSlug;
  for (const alias of SERVICE_ALIASES[ownSlug] ?? []) {
    if (directory.serviceSlugs.has(alias)) return alias;
  }
  return ownSlug;
}
