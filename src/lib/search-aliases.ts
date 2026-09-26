/**
 * Search-only alias tables: nicknames and abbreviations customers actually
 * type, mapped to a word that's genuinely likely to appear in the real
 * catalog's own name/slug. Never used to invent a service or country, and
 * never a substitute for the real synchronized catalog (src/lib/inventory.ts,
 * src/lib/provider-sync.ts) — this only widens what counts as a match
 * against that real data, exactly the way GrizzlySMS's own short codes are
 * already widened for logo-matching in src/lib/brand-match.ts.
 */

export const SERVICE_SEARCH_ALIASES: Record<string, string> = {
  wa: "whatsapp",
  ig: "instagram",
  insta: "instagram",
  fb: "facebook",
  meta: "facebook",
  tg: "telegram",
  yt: "youtube",
  tt: "tiktok",
  ds: "discord",
  vk: "vkontakte",
  twitter: "x",
  msft: "microsoft",
  outlook: "microsoft",
  hotmail: "microsoft",
  gmail: "google",
  ebay: "ebay",
};

/**
 * Common country names/abbreviations that don't already appear in a
 * dial-code or a plain substring of the display name.
 */
export const COUNTRY_SEARCH_ALIASES: Record<string, string> = {
  us: "united states",
  usa: "united states",
  america: "united states",
  uk: "united kingdom",
  britain: "united kingdom",
  gb: "united kingdom",
  uae: "united arab emirates",
  drc: "congo",
  koreasouth: "south korea",
  korea: "south korea",
  ivorycoast: "cote d'ivoire",
  czechia: "czech republic",
  holland: "netherlands",
};

function normalize(term: string): string {
  return term.trim().toLowerCase();
}

/** The query plus whatever it's aliased to, so a caller can match against
 *  either without needing to know the alias table exists. */
export function expandServiceQuery(query: string): string[] {
  const q = normalize(query);
  if (!q) return [q];
  const alias = SERVICE_SEARCH_ALIASES[q];
  return alias ? [q, alias] : [q];
}

export function expandCountryQuery(query: string): string[] {
  const q = normalize(query);
  if (!q) return [q];
  const alias = COUNTRY_SEARCH_ALIASES[q];
  return alias ? [q, alias] : [q];
}
