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
 *  - a "=" word matches only when it is the whole name, ignoring spaces and
 *    punctuation ("=match" blocks the dating app "Match" but not "Match
 *    Masters"; "=tangome" blocks "Tango Me");
 *  - a "$" word matches the end of the name ("$bet" blocks "Pusulabet") and a
 *    "^" word its start ("^fx" blocks "FxPro");
 *  - a word of seven or more letters matches inside longer words too;
 *  - several words match as a phrase ("iq option").
 * Crypto exchanges, brokers and investment apps count as trading and
 * investments, and dating apps of every kind are blocked.
 *
 * Look-alike Cyrillic letters are read as Latin first, so "СhampionСasino"
 * (with Cyrillic С) is caught like "ChampionCasino". Names a payment
 * provider's compliance review asked us to remove are listed by name in
 * COMPLIANCE_REMOVALS, on top of the rules.
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
    // Added after the compliance review
    "~invest", "~crypto", "~coin", "^fx", "accuindex", "stormgain", "mudrex", "=nifty", "=vantage", "~exness",
    "forex4you", "~bitcoin", "~blockchain", "~tradingview", "~stockbroker", "~cfd", "~faucet", "~web3",
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
    // Added after the compliance review
    "~ludo", "~777", "~888", "~jeet", "~slots", "$slot", "$bet", "$bets", "$exch", "~betexch", "$11", "$88",
    "$loto", "~teenpat", "~lottery", "~lotto", "~kasino", "~spinwin", "~winzo", "~iplwin", "~fantasy",
    "32red", "tipsport", "~tipsport", "~betting", "~sportsbet", "~parlay", "~poker", "~bingo", "~casino",
    "coin master", "coinmaster", "~realmoney", "~cashgame", "~rummy", "~satta", "~matka",
    "^bet", "~cazino", "~fastwin", "~parionssport", "~fortunabet",
  ],
  tobacco: [
    "~tobacco", "cigar", "cigars", "~cigarette", "~vape", "~vaping", "~hookah", "~shisha", "~nicotine", "~snus", "~ecig",
    "e cig", "e cigarette", "e cigarettes", "marlboro", "iqos", "juul", "ploom", "smoke shop", "smokeshop",
    "puff bar", "elf bar", "vuse", "lost mary", "hqd", "snuff", "chewing tobacco", "rolling papers",
    // Added after the compliance review
    "rothmans", "dunhill", "=bat", "winston", "=camel", "lucky strike", "pall mall", "philip morris",
    "~philipmorris", "heets", "terea", "veev", "glo hyper", "~marlboro",
  ],
  alcohol: [
    "~alcohol", "liquor", "liquors", "~whisky", "~whiskey", "~vodka", "~brewery", "~winery", "~distillery",
    "wine", "wines", "beer", "beers", "cocktail delivery", "vivino", "untappd", "drizly", "total wine",
    "totalwine", "bevmo", "heineken", "budweiser", "smirnoff", "hennessy", "guinness", "jack daniels",
    "absolut", "johnnie walker", "jagermeister", "wine com", "minibar delivery", "saucey",
    "~tequila", "~champagne", "brandy", "~cognac", "bacardi", "carlsberg", "diageo", "pernod", "stella artois",
    "corona extra", "spirits delivery", "alcohol delivery",
    // Added after the compliance review
    "budweiser", "=brahma", "=corona", "~oktoberfest", "tennents", "~spaten", "~brewing", "~brewer", "lager",
    "ambev", "abinbev", "ab inbev", "amstel", "desperados", "jameson", "baileys", "~jackdaniel", "=skol",
    "~beerhouse", "~wineshop", "~bebida",
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
    // Added after the compliance review: escort and personals sites
    "leolist", "locanto", "skipthegames", "listcrawler", "doublelist", "megapersonals", "backpage",
    "=tryst", "eroticmonkey", "slixa", "adultsearch", "~cityxguide", "=3fun", "~onlyfan", "~escort",
    "~sexy", "~xxx", "~hookup", "~nude",
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
    // Added after the compliance review
    "$dating", "~datingapp", "~swipeapp", "swipe app", "~love", "~znakom", "~flirt", "~singles",
    "~matrimon", "shaadi", "jeevansathi", "hornet", "scruff", "jackd", "planetromeo", "=romeo", "=feels",
    "~tinder", "~badoo", "~bumble", "~hinge", "~grindr", "~tantan", "~lovoo", "~hily", "~mamba",
    "~cupid", "$match", "~lybvi", "~lyubvi",
  ],
};

/**
 * Services a payment provider's compliance team named and asked us to
 * remove, by category, matched as whole names (spaces and punctuation
 * ignored). Many are already caught by the rules above; listing them
 * by name makes sure none slips through a gap in the rules.
 */
const COMPLIANCE_REMOVALS: Record<RestrictedCategory, string[]> = {
  trading: [
    "Investro", "Mainvest", "Mudrex", "Nifty", "Stormgain", "Univest", "Vantage", "XP Investimentos",
  ],
  gambling: [
    "IPLwin", "Jackaroo", "Jalwa Games", "Jeet11", "Jeetexch", "JojoBet", "Khelraja", "Kwiff", "Leon Club",
    "Lootably", "Luck", "luckgood", "LuckyBike", "Ludo Ninja", "Ludo Winner", "Ludo11", "ludoplus", "Ludosupreme",
    "Madslots", "MahaGames", "MrGreen", "MrQ", "NCA888", "NetBet", "Nice88", "OKbet", "Okwin", "OKVIP", "OPAP",
    "ParlayPlay", "PeryaGame", "PH777", "PlayOJO", "Playerzpot", "PlayKaro", "Pocket Ludo", "POCKET PLAY",
    "Porbet", "Probo", "Pusulabet", "Qbet", "QQPK", "Raja Games", "Riobet", "Royale", "Royaljeet", "RoyalWin",
    "Sankes and Ladders", "Snakes and Ladders", "Sisal", "SisalFunClub", "SkyBet", "SNAI", "Solitaire Cash",
    "Sorare", "Spincrush", "SpinWinner", "SportEfir", "SportGully", "Sportloto", "Sportsbuzz11", "Stanleybet",
    "Stoiximan", "Super Ace", "Superbet", "SynotTip", "Tbigwin", "Teenpati joy", "Tiranga", "TopGun", "UWIN",
    "ve88", "Veera", "Veergame", "Vision11", "Winclash", "WinGo", "WinMatch", "Winner", "WinzoGame", "WOG",
    "Wolf777", "swerte88", "YN777", "Yono777", "YoWin", "YoHo", "Zupee", "ChampionCasino", "32Red",
    "Tipsport Gamechanger", "51Exch", "8888.com",
  ],
  tobacco: ["Rothmans", "Dunhill", "BAT"],
  alcohol: ["Budweiser", "Brahma", "Corona", "SpatenOktoberfest", "Tennents"],
  adult: ["LeoList", "Locanto", "3Fun"],
  dating: [
    "PurePlatfrom", "PurePlatform", "Pure", "Hornet", "Scruff", "LoveRu", "Tantan", "Tango", "TangoMe", "Tangga",
    "Sweetring", "Skout", "Smitten", "Yubo", "SayHi Chat", "SayHi", "QuackQuack Dating App", "QuackQuack",
    "Pairs", "Omiai", "MirZnakomstv", "Meet Match", "Muzz", "Mylove", "LOVOO", "LoveAndSeek", "Jeevansathi",
    "Justdating", "JD Dating", "Happypancake", "hily", "Her", "Hing Swipe App", "Luxy", "roomster", "SoulApp",
    "Soul", "WooPlus", "Yik Yak", "Taki", "Tind Swipe App", "TeriMeriChoice", "Feels",
  ],
};

/**
 * Found by reading the live public directory, name by name, after the
 * compliance review: the same categories, under names the rules above do
 * not recognise on their own.
 */
const CATALOG_REVIEW_REMOVALS: Record<RestrictedCategory, string[]> = {
  trading: [
    "Ftx", "Bitexen", "Icrypex", "Bankera", "KCEX", "Weex", "Zoomex", "Ourbit", "Pintu", "Roqqu", "Ripio",
    "MoonPay", "Paybis", "Switchere", "Wirex", "Ziglu", "Nanovest", "Freedom24", "FreedomFinance", "Fasset",
    "Hinance", "BitClout", "BlockDag", "Hooked Protocol", "RelicDAO", "ChaingeFinance", "Web3Auth",
    "xworldwallet", "WikiFX", "TradeX", "Upland", "IndiaGold", "InFund", "OneAset", "GoerliFaucet", "Kaito",
    "NiftyGateway", "Trustee Plus", "RedotPay", "Wert", "Ari10", "Socios", "Cumbuca", "Gemini", "MoneyControl",
    "IncredMoney", "My Jar", "Siply",
  ],
  gambling: [
    "Ace2Three", "Adda52", "ApostaGanha", "ArenaPlus", "Big Cash", "Boyaa", "Casa Pariurilor", "ContiCazino",
    "Dabble", "Dangal365", "Govinda365", "FDJ ParionsSport", "Fastwin", "Fastwin 2", "FastPari", "Fliff",
    "Fortuna", "FortunaSK", "FunCrash", "Gamezy", "Getmega", "Gizbo", "Goa games", "Hitnspin", "HOT51",
    "HowZat", "Indiluck", "IndiaPlays", "KazandiRio", "Midnite", "PlayZone", "Pikkit", "ReddyBook", "STS",
    "WPK", "Crickpe", "Cricmatch", "Elite Competitions", "Rush", "Sixer", "Netwin", "Betexc", "Betflag",
    "Betine", "Betinin", "BETL", "betlive", "Betmartin", "BetMen", "BetOnRed", "Betorspin", "Betvet",
    "Dreamcash", "DreamMoney", "FastEarn", "EarnEasy", "KickCash", "Hey Cash", "Cashmine",
  ],
  tobacco: [],
  alcohol: ["Winelab", "ZéDelivery", "Zé Delivery"],
  adult: ["Findom", "FeetFinder", "Cityheaven", "Ero Me", "Feabie", "PCMAX", "FANS"],
  dating: [
    "Blued", "TheL", "Pride Nearby", "Christian Filipina", "Colombian Cupid", "Cupid Match", "CupidMedia",
    "FilipinoCupid", "InternationalCupid", "Instamatch", "EZMatch", "Fish Match", "Fotka", "Finya", "Singledk",
    "Moteplassen", "MocoSpace", "Photostrana", "Linii Lybvi", "Inshallah", "Salams", "FRND", "Quack", "Michat",
    "Wink", "LivU", "Bananatok", "This Fate",
  ],
};

/** Whole names that contain a restricted word but are not that thing. */
const ALLOWED_NAMES = new Set([
  "adult swim", "adult swim games", "essex", "sussex",
  // End in a restricted suffix ("bet", "88", "11") but are not betting.
  "alphabet", "tibet", "1688", "7 eleven", "betterhelp", "match masters",
]);

interface Matcher {
  category: RestrictedCategory;
  term: string;
  /** word: whole word; compact: inside the name with spaces removed; phrase: as consecutive words; exact: the whole name. */
  kind: "word" | "compact" | "phrase" | "exact" | "suffix" | "prefix";
  value: string;
}

function buildMatchers(): Matcher[] {
  const matchers: Matcher[] = [];
  for (const category of Object.keys(TERMS) as RestrictedCategory[]) {
    for (const raw of TERMS[category]) {
      if (raw.startsWith("=")) {
        matchers.push({ category, term: raw.slice(1), kind: "exact", value: compactOf(raw.slice(1)) });
      } else if (raw.startsWith("$")) {
        matchers.push({ category, term: raw.slice(1), kind: "suffix", value: raw.slice(1) });
      } else if (raw.startsWith("^")) {
        matchers.push({ category, term: raw.slice(1), kind: "prefix", value: raw.slice(1) });
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
  for (const category of Object.keys(COMPLIANCE_REMOVALS) as RestrictedCategory[]) {
    for (const name of [...COMPLIANCE_REMOVALS[category], ...CATALOG_REVIEW_REMOVALS[category]]) {
      matchers.push({ category, term: name, kind: "exact", value: compactOf(name) });
    }
  }
  return matchers;
}

const MATCHERS = buildMatchers();

/** Cyrillic letters that look like Latin ones, as suppliers sometimes type
 *  them inside otherwise Latin names ("СhampionСasino", "163СOM"). */
const LOOKALIKES: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ј: "j", ѕ: "s", ԁ: "d", ԛ: "q", ԝ: "w",
};

function compactOf(text: string): string {
  return normalize(text).replace(/ /g, "");
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[а-яёіјѕԁԛԝ]/g, (ch) => LOOKALIKES[ch] ?? ch)
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
            ? compact === m.value
            : m.kind === "suffix"
              ? compact.endsWith(m.value)
              : m.kind === "prefix"
                ? compact.startsWith(m.value)
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
