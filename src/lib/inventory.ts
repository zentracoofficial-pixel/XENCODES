import { prisma } from "@/lib/prisma";
import {
  getNumberProvider,
  PROVIDER_UNAVAILABLE_COPY,
  type ProviderService,
} from "@/lib/provider";
import { brandIcons } from "@/data/brand-icons";
import {
  loadMarginRules,
  quoteFor,
  isUsableCost,
  type PriceQuote,
} from "@/lib/pricing";

/**
 * Inventory and pricing: the one service the rest of Xencodes asks about
 * what can be bought and what it costs.
 *
 * One direction of travel, always: the supplier, then its adapter, then
 * this file, then a route handler or server action, then the browser. The
 * browser is never told a supplier cost and never gets a say in the price.
 * Everything here runs server side.
 *
 * With no supplier connected every read below returns nothing and
 * getInventoryStatus() says why. That is deliberate. Filling the gap with
 * sample services, prices or stock would mean a customer cannot tell a
 * real offer from a placeholder, which is worse than an empty shelf.
 */

const SERVICE_RESULT_LIMIT = 40;

/**
 * The services customers ask for most, listed first so they do not have to
 * be searched for.
 *
 * A discoverability hint, not a catalog. Each entry is matched against
 * whatever the live supplier actually returns: a slug here the supplier
 * does not offer simply never appears, and nothing is ever shown that
 * cannot be sold. Ordered, not alphabetical, because the order is the
 * point.
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
 * A service as the product sees it.
 *
 * Note what is absent: the supplier's own service id. That stays inside
 * the adapter, resolved from our slug when a purchase is made, so the
 * browser never handles supplier identifiers and the mapping can change
 * without touching the client.
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
  /** What the customer would pay, in kobo. Never a supplier cost. */
  priceKobo: number;
  /** 0 to 100, only when the supplier actually reports it. */
  successRate?: number;
}

export interface InventoryStatus {
  connected: boolean;
  /** Plain wording for the customer facing empty state. */
  message?: string;
}

/**
 * Why a pair cannot be priced. Each maps to something specific a customer
 * or admin can act on, rather than collapsing into "unavailable".
 */
export type QuoteFailure =
  | "no_provider"
  | "unavailable"
  | "disabled"
  | "unpriceable"
  | "provider_error";

export type QuoteResult =
  | {
      ok: true;
      quote: PriceQuote;
      service: InventoryService;
      country: InventoryCountry;
      provider: string;
    }
  | { ok: false; reason: QuoteFailure };

/**
 * The single place a service's colour is decided.
 *
 * A supplier reports no brand colour at all, only a name; ServiceLogo
 * renders whatever real icon it has for a slug in the colour it is given,
 * so a real icon needs its real hex here or it renders in the fallback
 * tint. brandIcons is the one reusable logo mapping used everywhere a
 * service appears (this directory, the buy flow, order history, order
 * details, the admin), so this is the one place that reads it to decide a
 * colour: every caller of toInventoryService() gets a correct colour for
 * free rather than needing to know brandIcons exists.
 */
function toInventoryService(service: ProviderService): InventoryService {
  return {
    slug: service.slug,
    name: service.name,
    color: brandIcons[service.slug]?.hex ?? service.color,
    category: service.category,
    popular: POPULAR_RANK.has(service.slug),
  };
}

/** Whether numbers can be sold at all right now, and what to say if not. */
export async function getInventoryStatus(): Promise<InventoryStatus> {
  const resolved = await getNumberProvider();
  if (!resolved.connected) {
    return { connected: false, message: PROVIDER_UNAVAILABLE_COPY[resolved.reason] };
  }
  return { connected: true };
}

/**
 * Services matching a search, or the first page of them when the query is
 * empty. Filtered and capped server side: a supplier's catalog runs to
 * thousands of names, and shipping all of them to a combobox is what makes
 * that combobox unusable.
 */
export async function searchServices(
  query: string,
  limit = SERVICE_RESULT_LIMIT,
): Promise<InventoryService[]> {
  const [resolved, disabledRows] = await Promise.all([
    getNumberProvider(),
    prisma.serviceSetting.findMany({ where: { enabled: false } }),
  ]);
  if (!resolved.connected) return [];

  const disabled = new Set(disabledRows.map((row) => row.slug));
  const services = (await resolved.provider.getServices()).filter(
    (service) => !disabled.has(service.slug),
  );

  const q = query.trim().toLowerCase();
  // Match on the slug as well as the display name: suppliers list several
  // services under compound names, and someone typing "google" should find
  // a row named "Google/Gmail".
  const matches = q
    ? services.filter(
        (service) =>
          service.name.toLowerCase().includes(q) || service.slug.includes(q),
      )
    : services;

  const rankOf = (slug: string) => POPULAR_RANK.get(slug) ?? Infinity;

  const ranked = [...matches].sort((a, b) => {
    const aRank = rankOf(a.slug);
    const bRank = rankOf(b.slug);
    // Popular services lead, in their configured order, both when browsing
    // and when searching.
    if (aRank !== bRank && Number.isFinite(Math.min(aRank, bRank))) {
      return aRank - bRank;
    }
    if (q) {
      // Then whatever starts with what was typed, which is nearly always
      // what is being typed towards.
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
    }
    return a.name.localeCompare(b.name);
  });

  return ranked.slice(0, limit).map(toInventoryService);
}

/** How many services are on sale. Zero with no supplier connected, which
 *  is what the marketing pages render their empty state from. */
export async function countServices(): Promise<number> {
  const [resolved, disabledRows] = await Promise.all([
    getNumberProvider(),
    prisma.serviceSetting.findMany({ where: { enabled: false } }),
  ]);
  if (!resolved.connected) return 0;

  const disabled = new Set(disabledRows.map((row) => row.slug));
  const services = await resolved.provider.getServices();
  return services.filter((service) => !disabled.has(service.slug)).length;
}

/** Display metadata for one service, or null when it cannot be sold. */
export async function getServiceMeta(
  serviceSlug: string,
): Promise<InventoryService | null> {
  const [resolved, setting] = await Promise.all([
    getNumberProvider(),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
  ]);
  if (!resolved.connected || setting?.enabled === false) return null;

  const service = (await resolved.provider.getServices()).find(
    (row) => row.slug === serviceSlug,
  );
  return service ? toInventoryService(service) : null;
}

/**
 * The countries this one service can actually be bought in, priced.
 *
 * Only pairs the supplier currently quotes come back, so a country with no
 * stock is absent rather than listed and then failing at purchase. A pair
 * whose cost cannot be read is dropped too: an unknown cost is an unknown
 * margin, and there is no safe price to show against it.
 *
 * Prices here are for display. The purchase path re-quotes live before
 * charging, in quotePair().
 */
export async function getServiceCountries(
  serviceSlug: string,
): Promise<InventoryCountry[]> {
  const [resolved, rules, serviceSetting] = await Promise.all([
    getNumberProvider(),
    loadMarginRules(),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
  ]);

  if (!resolved.connected || serviceSetting?.enabled === false) return [];

  const offers = await resolved.provider.getCountries(serviceSlug);

  return offers
    .filter((offer) => offer.stock !== "out_of_stock")
    .flatMap((offer) => {
      if (!isUsableCost(offer.costKobo)) return [];
      const quote = quoteFor(rules, offer.costKobo, serviceSlug);
      return [
        {
          slug: offer.country.slug,
          name: offer.country.name,
          flag: offer.country.flag,
          dialCode: offer.country.dialCode,
          nationalDigits: offer.country.nationalDigits,
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
 * a stale figure, and so a purchase can be refused outright.
 */
export async function quotePair(
  serviceSlug: string,
  countrySlug: string,
): Promise<QuoteResult> {
  const [resolved, rules, serviceSetting] = await Promise.all([
    getNumberProvider(),
    loadMarginRules(),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
  ]);

  if (!resolved.connected) return { ok: false, reason: "no_provider" };
  if (serviceSetting?.enabled === false) return { ok: false, reason: "disabled" };

  const { provider } = resolved;

  let offer;
  let service;
  try {
    [offer, service] = await Promise.all([
      provider.getAvailability(serviceSlug, countrySlug),
      provider.getServices().then((rows) => rows.find((r) => r.slug === serviceSlug)),
    ]);
  } catch (error) {
    console.error(
      `[inventory] live lookup failed for "${serviceSlug}" in "${countrySlug}":`,
      error,
    );
    return { ok: false, reason: "provider_error" };
  }

  if (!offer || !service || offer.stock === "out_of_stock") {
    return { ok: false, reason: "unavailable" };
  }

  // No usable cost means no knowable margin, so there is no price to
  // quote and nothing to sell. Refused here rather than guessed.
  if (!isUsableCost(offer.costKobo)) {
    console.error(
      `[inventory] refusing to price "${serviceSlug}" in "${countrySlug}": ` +
        `provider returned an unusable cost (${offer.costKobo})`,
    );
    return { ok: false, reason: "unpriceable" };
  }

  const quote = quoteFor(rules, offer.costKobo, serviceSlug);

  return {
    ok: true,
    quote,
    provider: provider.id,
    service: toInventoryService(service),
    country: {
      slug: offer.country.slug,
      name: offer.country.name,
      flag: offer.country.flag,
      dialCode: offer.country.dialCode,
      nationalDigits: offer.country.nationalDigits,
      priceKobo: quote.customerPriceKobo,
      successRate: offer.successRate,
    },
  };
}
