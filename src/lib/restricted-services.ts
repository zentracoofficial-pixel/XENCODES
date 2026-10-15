/**
 * Services Xencodes does not sell: trading, forex and investments; gambling,
 * betting and real-money games; tobacco and vaping; alcohol; adult (18+)
 * content; and dating platforms.
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
 *    "Alphabet"; "sex" blocks "Sex Chat" but not "Essex");
 *  - a "~" word also matches inside a longer word ("~forex" blocks
 *    "Forex4You", "~casino" blocks "CasinoX");
 *  - a "=" word matches only when it is the whole name ("=match" blocks the
 *    dating app "Match" but not "Match Masters");
 *  - a word of seven or more letters matches inside longer words too;
 *  - several words match as a phrase ("iq option").
 * Crypto exchanges, brokers and investment apps count as trading and
 * investments, and dating apps of every kind are blocked.
 */

export type RestrictedCategory = "trading" | "gambling" | "tobacco" | "alcohol" | "adult" | "dating";

export const RESTRICTED_CATEGORY_LABEL: Record<RestrictedCategory, string> = {
  trading: "Trading, forex and investments",
  gambling: "Gambling, betting and real-money games",
  tobacco: "Tobacco and vaping",
  alcohol: "Alcohol",
  adult: "Adult (18+) and escort",
  dating: "Dating",
};

const TERMS: Record<RestrictedCategory, string[]> = {
  trading: [
    // Forex, CFDs, binary options and prop firms
    "~forex", "~metatrader", "~binaryoption", "binary options", "cfd", "cfd trading", "fx trading",
    "exness", "iq option", "olymp trade", "quotex", "pocket option", "binomo", "deriv", "avatrade", "fxpro",
    "hotforex", "roboforex", "plus500", "etoro", "pepperstone", "oanda", "tickmill", "ic markets",
    "fxcm", "libertex", "capital com", "expertoption", "forextime", "instaforex", "octafx", "alpari",
    "fxtm", "nordfx", "xm", "fbs", "hfm", "xtb", "mt4", "mt5", "olymptrade", "iqoption", "pocketoption",
    "ig markets", "fxopen", "forex club", "fxgrow", "tradersway", "vantage fx", "equiti", "axiory",
    "prop firm", "funded trader", "ftmo", "myforexfunds", "~ninjatrader", "tradovate", "tradestation",
    "thinkorswim", "tastytrade", "tastyworks", "saxo", "degiro",
    // Trading and investing in general
    "trading", "trader", "traders", "trade republic", "copy trading", "invest", "investing", "investment",
    "investments", "investor", "investors", "stocks", "stock market", "stock trading", "broker", "brokers",
    "brokerage", "etf", "etfs", "mutual fund", "mutual funds", "hedge fund", "ponzi", "~hyip", "mlm",
    "pyramid scheme", "cloud mining", "staking", "wealth management",
    // Stock and investment apps
    "robinhood", "webull", "moomoo", "acorns", "wealthfront", "betterment", "schwab", "vanguard",
    "etrade", "e trade", "ameritrade", "freetrade", "zerodha", "groww", "upstox", "angel one", "angelone",
    "paytm money", "kuvera", "scripbox", "piggyvest", "cowrywise", "risevest", "trove", "chaka", "~afrinvest",
    // Crypto: exchanges, wallets and coins
    "crypto", "~cryptocurrenc", "bitcoin", "ethereum", "dogecoin", "binance", "coinbase", "kraken", "bybit",
    "okx", "kucoin", "bitget", "htx", "huobi", "mexc", "gate io", "bitfinex", "bitstamp", "crypto com",
    "bitpanda", "bitmart", "bitso", "luno", "paxful", "remitano", "yellow card", "quidax", "busha", "bitmama",
    "blockchain com", "coinmarketcap", "coingecko", "coinex", "lbank", "bingx", "phemex", "deribit", "bitmex",
    "poloniex", "wazirx", "coindcx", "coinswitch", "upbit", "bithumb", "bitflyer", "hitbtc", "bitrue",
    "blofin", "pionex", "nexo", "uphold", "trust wallet", "metamask", "uniswap", "pancakeswap", "opensea", "nft",
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
    // More bookmakers
    "sportsbet", "sportpesa", "betika", "odibets", "paripesa", "megapari", "linebet", "betandyou", "helabet",
    "premierbet", "supabets", "hollywoodbets", "betlion", "livescorebet", "surebet247", "merrybet", "lovebet",
    "betobet", "gamdom", "csgoroll", "bookmaker", "bookmakers", "bookie", "bookies", "lottoland", "keno",
    "football pools", "scratch cards", "scratch card", "polymarket", "kalshi", "predictit", "prediction market",
    "prediction markets",
    // Real-money games
    "real money", "realmoney", "real cash", "cash games", "~rummy", "teen patti", "teenpatti", "fantasy sports",
    "fantasy cricket", "fantasy football", "fantasy league", "dream11", "my11circle", "junglee", "winzo",
    "=mpl", "=a23", "pocket52", "sweepstakes", "sweeps", "chumba", "pulsz", "mcluck", "funrize",
    "fortune coins", "skin gambling", "csgoempire", "hellcase", "keydrop", "key drop", "farmskins",
    "skinclub", "case opening", "case battle", "case battles", "play to earn", "earn money games",
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
    "~tequila", "~champagne", "brandy", "~cognac", "bacardi", "carlsberg", "diageo", "pernod", "stella artois",
    "corona extra", "spirits delivery", "alcohol delivery",
  ],
  adult: [
    "~porn", "~xxx", "~onlyfans", "~nsfw", "~erotic", "~camgirl", "~sexting", "~hentai", "~escort", "escorts",
    "adult", "adults", "sex", "sexy", "sexual", "hookup", "hookups", "fetish", "nude", "nudes", "naked",
    "camming", "stripper", "strippers", "swinger", "swingers", "orgy", "milf", "18plus", "18 plus",
    "pornhub", "xvideos", "xnxx", "xhamster", "redtube", "youporn", "fansly", "chaturbate", "stripchat",
    "livejasmin", "bongacams", "cam4", "camsoda", "myfreecams", "manyvids", "brazzers", "clips4sale",
    "fetlife", "adultfriendfinder", "adult friend finder", "ashley madison", "ashleymadison", "sugar daddy",
    "sugardaddy", "seeking arrangement", "fling", "xtube", "spankbang", "eporner",
    "nsfw chat", "sex chat", "adult chat", "adult dating", "lovense", "loyalfans", "fancentro",
    "call girl", "call girls", "~callgirl", "~brothel", "prostitute", "prostitutes", "~sexcam", "live cam",
    "cam girls", "cam model", "webcam model", "~justforfans", "fanvue", "playboy", "sex shop", "~sexshop",
    "adult toys", "~bdsm", "kinky", "dominatrix", "threesome", "companionship services", "erotic massage",
    "sensual massage", "gonewild", "18 chat", "18 only",
  ],
  dating: [
    "dating", "singles", "mingle", "flirt", "~flirting", "tinder", "bumble", "badoo", "hinge", "okcupid",
    "grindr", "happn", "tantan", "plenty of fish", "pof", "eharmony", "match com", "matchcom", "zoosk",
    "meetic", "mamba", "skout", "jaumo", "lovoo", "feeld", "coffee meets bagel", "the league", "christian mingle",
    "christianmingle", "jdate", "elite singles", "elitesingles", "silver singles", "ourtime", "black people meet",
    "blackpeoplemeet", "lovestruck", "loveplanet", "~meetme", "waplog", "hily", "litmatch", "azar", "chispa",
    "paktor", "dil mil", "dilmil", "trulymadly", "truly madly", "aisle", "hot or not", "omegle", "ome tv",
    "chatroulette", "=match", "=her", "=tagged", "=boo", "=lex", "datemyage", "date my age", "lavalife",
    "mingle2",
  ],
};

/** Whole names that contain a restricted word but are not that thing. */
const ALLOWED_NAMES = new Set(["adult swim", "adult swim games", "essex", "sussex"]);

interface Matcher {
  category: RestrictedCategory;
  term: string;
  /** word: whole word; compact: inside the name with spaces removed; phrase: as consecutive words; exact: the whole name. */
  kind: "word" | "compact" | "phrase" | "exact";
  value: string;
}

function buildMatchers(): Matcher[] {
  const matchers: Matcher[] = [];
  for (const category of Object.keys(TERMS) as RestrictedCategory[]) {
    for (const raw of TERMS[category]) {
      if (raw.startsWith("=")) {
        matchers.push({ category, term: raw.slice(1), kind: "exact", value: raw.slice(1) });
      } else if (raw.startsWith("~")) {
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
          : m.kind === "exact"
            ? spaced === m.value
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
