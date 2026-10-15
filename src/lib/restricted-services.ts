/**
 * Services Xencodes does not sell: forex and trading, gambling and betting,
 * tobacco and vaping, alcohol, and adult (18+) content.
 *
 * GrizzlySMS gives no categories ("All services" for everything), so this is
 * decided from a service's name. It is code, not an admin switch, so nothing
 * an admin toggles, a catalog sync brings back or a request names can turn a
 * restricted service on. It is applied at every layer: the GrizzlySMS
 * adapter never lists them (so search, quotes, purchases and the catalog sync
 * cannot see them), the catalog sync drops and purges them, every browse read
 * filters them, and a quote or purchase for one is refused.
 *
 * Matching works on the name and slug together, split into words:
 *  - a plain word matches only a whole word ("bet" blocks "Bet 365" but not
 *    "Betterment"; "sex" blocks "Sex Chat" but not "Essex");
 *  - a "~" word also matches inside a longer word ("~forex" blocks
 *    "Forex4You", "~casino" blocks "CasinoX");
 *  - a word of seven or more letters matches inside longer words too;
 *  - several words match as a phrase ("iq option").
 * Mainstream dating apps are not adult content and are not blocked.
 */

export type RestrictedCategory = "forex" | "gambling" | "tobacco" | "alcohol" | "adult";

export const RESTRICTED_CATEGORY_LABEL: Record<RestrictedCategory, string> = {
  forex: "Forex and trading",
  gambling: "Gambling and betting",
  tobacco: "Tobacco and vaping",
  alcohol: "Alcohol",
  adult: "Adult (18+)",
};

const TERMS: Record<RestrictedCategory, string[]> = {
  forex: [
    "~forex", "~metatrader", "~binaryoption", "binary options", "cfd", "cfd trading", "fx trading",
    "exness", "iq option", "olymp trade", "quotex", "pocket option", "binomo", "deriv", "avatrade", "fxpro",
    "hotforex", "roboforex", "plus500", "etoro", "pepperstone", "oanda", "tickmill", "ic markets",
    "fxcm", "libertex", "capital com", "expertoption", "forextime", "instaforex", "octafx", "alpari",
    "fxtm", "nordfx", "xm", "fbs", "hfm", "xtb", "mt4", "mt5", "olymptrade", "iqoption", "pocketoption",
    "ig markets", "fxopen", "forex club", "fxgrow", "tradersway", "vantage fx", "equiti", "axiory",
  ],
  gambling: [
    "~casino", "~gambl", "~betting", "~sportsbook", "~poker", "lotto", "~lottery", "~jackpot", "~roulette",
    "~blackjack", "~baccarat", "~bingo", "~wager", "bet", "bets", "slots", "slot machine", "jackpots",
    "bet365", "1xbet", "1xslots", "melbet", "betway", "sportybet", "bet9ja", "betking", "nairabet", "22bet",
    "parimatch", "betwinner", "mostbet", "1win", "pinup", "pin up", "betfair", "william hill", "ladbrokes",
    "paddy power", "unibet", "bwin", "betano", "betsson", "bovada", "draftkings", "fanduel", "betmgm",
    "stake", "roobet", "bcgame", "bc game", "duelbits", "rollbit", "betboom", "fonbet", "winline",
    "betcity", "888casino", "pokerstars", "partypoker", "bodog", "10bet", "betvictor", "888sport",
    "dafabet", "betonline", "bangbet", "betpawa", "msport", "1xbit", "sbobet", "bet fair", "lottomatica",
    "powerball", "megamillions", "mega millions", "euromillions", "slotomania", "joycasino",
    "gg bet", "ggbet", "bet boom", "leovegas", "bet online", "wazamba", "stakecasino", "bitcasino",
  ],
  tobacco: [
    "~tobacco", "cigar", "cigars", "~cigarette", "~vape", "~vaping", "~hookah", "~shisha", "~nicotine", "~snus", "~ecig",
    "e cig", "e cigarette", "e cigarettes", "marlboro", "iqos", "juul", "ploom", "smoke shop", "smokeshop",
    "puff bar", "elf bar", "vuse", "lost mary", "hqd", "snuff", "chewing tobacco", "rolling papers",
  ],
  alcohol: [
    "~alcohol", "liquor", "liquors", "~whisky", "~whiskey", "~vodka", "~brewery", "~winery", "~distillery",
    "wine", "wines", "beer", "beers", "cocktail delivery", "vivino", "untappd", "drizly", "total wine",
    "totalwine", "bevmo", "heineken", "budweiser", "smirnoff", "hennessy", "guinness", "jack daniels",
    "absolut", "johnnie walker", "jagermeister", "wine com", "minibar delivery", "saucey",
  ],
  adult: [
    "~porn", "~xxx", "~onlyfans", "~nsfw", "~erotic", "~camgirl", "~sexting", "~hentai", "escort", "escorts",
    "adult", "adults", "sex", "sexy", "sexual", "hookup", "hookups", "fetish", "nude", "nudes", "naked",
    "camming", "stripper", "strippers", "swinger", "swingers", "orgy", "milf", "18plus", "18 plus",
    "pornhub", "xvideos", "xnxx", "xhamster", "redtube", "youporn", "fansly", "chaturbate", "stripchat",
    "livejasmin", "bongacams", "cam4", "camsoda", "myfreecams", "manyvids", "brazzers", "clips4sale",
    "fetlife", "adultfriendfinder", "adult friend finder", "ashley madison", "ashleymadison", "sugar daddy",
    "sugardaddy", "seeking arrangement", "fling", "xtube", "spankbang", "eporner",
    "nsfw chat", "sex chat", "adult chat", "adult dating", "lovense", "loyalfans", "fancentro",
  ],
};

/** Whole names that contain a restricted word but are not that thing. */
const ALLOWED_NAMES = new Set(["adult swim", "adult swim games", "essex", "sussex"]);

interface Matcher {
  category: RestrictedCategory;
  term: string;
  /** word: whole word; compact: inside the name with spaces removed; phrase: as consecutive words. */
  kind: "word" | "compact" | "phrase";
  value: string;
}

function buildMatchers(): Matcher[] {
  const matchers: Matcher[] = [];
  for (const category of Object.keys(TERMS) as RestrictedCategory[]) {
    for (const raw of TERMS[category]) {
      if (raw.startsWith("~")) {
        matchers.push({ category, term: raw.slice(1), kind: "compact", value: raw.slice(1) });
      } else if (raw.includes(" ")) {
        matchers.push({ category, term: raw, kind: "phrase", value: raw });
        // "iq option" is just as often written "iqoption" or "IQ-Option".
        matchers.push({ category, term: raw, kind: raw.replace(/ /g, "").length >= 7 ? "compact" : "word", value: raw.replace(/ /g, "") });
      } else if (raw.length >= 7) {
        matchers.push({ category, term: raw, kind: "compact", value: raw });
      } else {
        matchers.push({ category, term: raw, kind: "word", value: raw });
      }
    }
  }
  return matchers;
}

const MATCHERS = buildMatchers();

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface RestrictedMatch {
  category: RestrictedCategory;
  /** The word or brand that matched, for the admin's list. */
  term: string;
}

/**
 * Which restricted category a service falls in, or null when it is fine.
 * Pass the display name and/or the slug; either matching is enough.
 */
export function restrictedMatch(...texts: Array<string | null | undefined>): RestrictedMatch | null {
  for (const text of texts) {
    if (!text) continue;
    const spaced = normalize(text);
    if (!spaced || ALLOWED_NAMES.has(spaced)) continue;
    const words = new Set(spaced.split(" "));
    const compact = spaced.replace(/ /g, "");
    const padded = ` ${spaced} `;
    for (const m of MATCHERS) {
      const hit =
        m.kind === "word"
          ? words.has(m.value)
          : m.kind === "compact"
            ? compact.includes(m.value)
            : padded.includes(` ${m.value} `);
      if (hit) return { category: m.category, term: m.term };
    }
  }
  return null;
}

export function isRestrictedService(slug: string, name?: string | null): boolean {
  return restrictedMatch(name, slug) !== null;
}

/** Splits a service list into what may be sold and what is blocked, with the
 *  reason for each blocked one. */
export function splitRestricted<T extends { slug: string; name: string }>(
  services: T[],
): { allowed: T[]; blocked: Array<T & RestrictedMatch> } {
  const allowed: T[] = [];
  const blocked: Array<T & RestrictedMatch> = [];
  for (const service of services) {
    const match = restrictedMatch(service.name, service.slug);
    if (match) blocked.push({ ...service, ...match });
    else allowed.push(service);
  }
  return { allowed, blocked };
}
