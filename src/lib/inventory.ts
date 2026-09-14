import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/provider";
import { loadMarkupRules, quoteFor, type PriceQuote } from "@/lib/pricing";

/**
 * The inventory and pricing service the buy flow runs on.
 *
 * One direction of travel, always: SMSPool, then the provider adapter,
 * then this file, then an API route or server action, then the browser.
 * The browser is never told a provider cost and never gets a say in the
 * price. Everything here runs server side, so the API key stays there.
 *
 * Distinct from src/lib/catalog.ts on purpose. That builds the small,
 * eagerly priced set the homepage and marketing pages render fast from a
 * cache. This answers the narrower and more current questions the buy
 * flow needs: which services exist, which countries can this one service
 * actually be bought in right now, and what does this exact pair cost at
 * this moment.
 */

const SERVICE_RESULT_LIMIT = 40;

/**
 * The services customers ask for most, listed first so they do not have to
 * be searched for.
 *
 * This is a discoverability hint, not a catalog. Each entry is matched
 * against whatever the live provider actually returns, by slug: a slug
 * here that SMSPool does not currently offer simply never appears, and no
 * service is ever shown that the provider cannot sell. Everything outside
 * this list stays fully searchable.
 *
 * Ordered, not alphabetical, because the order is the point.
 */
const POPULAR_SERVICE_SLUGS = [
  "whatsapp",
  "instagram",
  "facebook",
  "telegram",
  "google",
  "tiktok",
  "x",
  "discord",
  "signal",
  "fiverr",
  "snapchat",
  "microsoft",
  "amazon",
  "paypal",
  "uber",
  "airbnb",
] as const;

const POPULAR_RANK = new Map(
  POPULAR_SERVICE_SLUGS.map((slug, index) => [slug as string, index]),
);

/**
 * A service as the buy flow sees it.
 *
 * Note what is absent: the provider's own service id. That stays server
 * side, resolved from the slug when a purchase is made, so the browser
 * never handles provider identifiers and the mapping between our slug and
 * SMSPool's id can change without touching the client.
 */
export interface InventoryService {
  slug: string;
  name: string;
  color: string;
  category: string;
  /** True when this is one of the commonly requested services above. */
  popular: boolean;
}

export interface InventoryCountry {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  nationalDigits: number;
  priceKobo: number;
  /** 0 to 100, only when the provider actually reports it. */
  successRate?: number;
}

export type QuoteResult =
  | { ok: true; priceKobo: number; quote: PriceQuote }
  | { ok: false; reason: "unavailable" | "disabled" | "provider_error" };

/**
 * Services matching a search, or the first page of them when the query is
 * empty. Filtered and capped server side: SMSPool lists well over a
 * thousand, and shipping all of them to a combobox is what makes that
 * combobox unusable.
 */
export async function searchServices(
  query: string,
  limit = SERVICE_RESULT_LIMIT,
): Promise<InventoryService[]> {
  const [provider, serviceSettings] = await Promise.all([
    getProvider(),
    prisma.serviceSetting.findMany({ where: { enabled: false } }),
  ]);

  const disabled = new Set(serviceSettings.map((row) => row.slug));
  const services = (await provider.listServices()).filter(
    (service) => !disabled.has(service.slug),
  );

  const q = query.trim().toLowerCase();
  // Match on the slug as well as the display name: SMSPool lists several
  // services under compound names ("Instagram / Threads", "Google/Gmail"),
  // and someone typing "google" should find that row.
  const matches = q
    ? services.filter(
        (service) =>
          service.name.toLowerCase().includes(q) || service.slug.includes(q),
      )
    : services;

  const rankOf = (slug: string) => POPULAR_RANK.get(slug) ?? Infinity;

  const ranked = [...matches].sort((a, b) => {
    // Popular services lead, in their configured order, both when
    // browsing and when searching.
    const byPopularity = rankOf(a.slug) - rankOf(b.slug);
    if (byPopularity !== 0 && Number.isFinite(Math.min(rankOf(a.slug), rankOf(b.slug)))) {
      return byPopularity;
    }
    if (q) {
      // Then whatever starts with what was typed, which is nearly always
      // the thing being typed towards.
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
    }
    return a.name.localeCompare(b.name);
  });

  return ranked.slice(0, limit).map((service) => ({
    slug: service.slug,
    name: service.name,
    color: service.color,
    category: service.category,
    popular: POPULAR_RANK.has(service.slug),
  }));
}

/**
 * The countries this one service can actually be bought in, priced.
 *
 * Only pairs the provider currently quotes a price for come back, so a
 * country with no stock for this service is absent rather than listed and
 * then failing at purchase. Prices here are for display: the purchase
 * path re-quotes live before charging (see getLiveQuote).
 */
export async function getServiceCountries(
  serviceSlug: string,
): Promise<InventoryCountry[]> {
  const [provider, rules, countrySettings, serviceSetting] = await Promise.all([
    getProvider(),
    loadMarkupRules(),
    prisma.countrySetting.findMany({ where: { enabled: false } }),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
  ]);

  if (serviceSetting?.enabled === false) return [];

  const disabled = new Set(countrySettings.map((row) => row.slug));
  const [offers, countries, services] = await Promise.all([
    provider.listOffersForService(serviceSlug),
    provider.listCountries(),
    provider.listServices(),
  ]);

  const countryBySlug = new Map(countries.map((c) => [c.slug, c]));
  const category = services.find((s) => s.slug === serviceSlug)?.category;

  return offers
    .filter((offer) => offer.stock !== "out_of_stock")
    .filter((offer) => !disabled.has(offer.countrySlug))
    .flatMap((offer) => {
      const country = countryBySlug.get(offer.countrySlug);
      if (!country) return [];

      const quote = quoteFor(rules, offer.costKobo, {
        serviceSlug,
        countrySlug: offer.countrySlug,
        category,
      });

      return [
        {
          slug: country.slug,
          name: country.name,
          flag: country.flag,
          dialCode: country.dialCode,
          nationalDigits: country.nationalDigits,
          priceKobo: quote.customerPriceKobo,
          successRate: offer.successRate,
        },
      ];
    })
    .sort((a, b) => a.priceKobo - b.priceKobo);
}

/**
 * The authoritative quote for one pair, priced from a cost fetched right
 * now with no cache in the way.
 *
 * Both the price shown on the buy page and the price charged at purchase
 * come from here, so the two cannot drift apart by more than the moment
 * between them. Returns a reason rather than a price when the pair cannot
 * be sold, so callers can say something useful instead of falling back to
 * a stale figure.
 */
export async function getLiveQuote(
  serviceSlug: string,
  countrySlug: string,
): Promise<QuoteResult> {
  const [provider, rules, serviceSetting, countrySetting] = await Promise.all([
    getProvider(),
    loadMarkupRules(),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
    prisma.countrySetting.findUnique({ where: { slug: countrySlug } }),
  ]);

  if (serviceSetting?.enabled === false || countrySetting?.enabled === false) {
    return { ok: false, reason: "disabled" };
  }

  let costKobo: number | null;
  try {
    costKobo = await provider.getLiveCostKobo(serviceSlug, countrySlug);
  } catch (error) {
    console.error(
      `[inventory] live cost lookup failed for "${serviceSlug}" in "${countrySlug}":`,
      error,
    );
    return { ok: false, reason: "provider_error" };
  }

  if (costKobo === null) return { ok: false, reason: "unavailable" };

  const services = await provider.listServices();
  const category = services.find((s) => s.slug === serviceSlug)?.category;
  const quote = quoteFor(rules, costKobo, { serviceSlug, countrySlug, category });

  return { ok: true, priceKobo: quote.customerPriceKobo, quote };
}

/** Display metadata for one service, or null when it is not sellable. */
export async function getServiceMeta(
  serviceSlug: string,
): Promise<InventoryService | null> {
  const [provider, setting] = await Promise.all([
    getProvider(),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
  ]);

  if (setting?.enabled === false) return null;

  const service = (await provider.listServices()).find(
    (row) => row.slug === serviceSlug,
  );
  if (!service) return null;

  return {
    slug: service.slug,
    name: service.name,
    color: service.color,
    category: service.category,
    popular: POPULAR_RANK.has(service.slug),
  };
}
