import { prisma } from "@/lib/prisma";
import {
  getNumberProvider,
  getEnabledProviders,
  PROVIDER_UNAVAILABLE_COPY,
  type ProviderService,
  type ProviderAvailability,
} from "@/lib/provider";
import { resolveBrandIcon } from "@/lib/brand-match";
import {
  loadMarginRules,
  quoteForCurrency,
  isUsableUsdCost,
  type PriceQuote,
} from "@/lib/pricing";
import { anyProviderCacheFresh } from "@/lib/provider-sync";
import { getDefaultCurrency, type CurrencyConfigEntry } from "@/lib/currency-config";

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
  /** What the customer would pay, in the minor unit of whichever currency
   *  was quoted for. Never a supplier cost. */
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
      /** Which provider (registry id) this exact quote came from. This is
       *  the provider a purchase must go through: with more than one
       *  enabled provider, the winning one can differ call to call as
       *  prices and stock move, so a purchase always re-resolves this
       *  specific id rather than assuming "the" provider. */
      provider: string;
      /** The winning provider's own ids for this service/country, carried
       *  through so a purchase can record them on the order. Reporting
       *  only: never used to talk to a provider directly. */
      providerServiceId?: string;
      providerCountryId?: string;
    }
  | { ok: false; reason: QuoteFailure };

/**
 * The single place a service's colour is decided.
 *
 * A supplier reports no brand colour at all, only a name; ServiceLogo
 * renders whatever real icon it has for a slug in the colour it is given,
 * so a real icon needs its real hex here or it renders in the fallback
 * tint. resolveBrandIcon() is the one reusable logo-matching function used
 * everywhere a service appears (this directory, the buy flow, order
 * history, order details, the admin), so this is the one place that calls
 * it to decide a colour: every caller of toInventoryService() gets a
 * correct colour for free rather than needing to know it exists.
 */
function toInventoryService(service: ProviderService): InventoryService {
  return {
    slug: service.slug,
    name: service.name,
    color: resolveBrandIcon(service.slug, service.name)?.hex ?? service.color,
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
 * The service catalog to search or browse, from the synced cache when it
 * is fresh, otherwise a live call.
 *
 * This is the only place that distinction is made for services: everyone
 * downstream (searchServices, countServices, getServiceMeta) gets the same
 * list regardless of where it came from, so there is exactly one service
 * list, not one per page and not one per cache state.
 *
 * With more than one provider enabled, a service is listed the moment ANY
 * of them offers it: the cache read is not scoped to one providerId (a
 * service two providers both sell is one row here, not two), and the live
 * fallback merges every enabled provider's own list, keeping the first
 * (highest-priority) provider's display details on a slug both report.
 */
async function loadServiceCatalog(): Promise<ProviderService[] | null> {
  if (await anyProviderCacheFresh()) {
    const cached = await prisma.syncedOffer.findMany({
      distinct: ["serviceSlug"],
      select: { serviceSlug: true, serviceName: true, serviceColor: true, category: true },
    });
    if (cached.length > 0) {
      return cached.map((row) => ({
        slug: row.serviceSlug,
        name: row.serviceName,
        color: row.serviceColor,
        category: row.category,
      }));
    }
  }

  const providers = await getEnabledProviders();
  if (providers.length === 0) return null;

  const merged = new Map<string, ProviderService>();
  for (const { id, provider } of providers) {
    let services: ProviderService[];
    try {
      services = await provider.getServices();
    } catch (error) {
      console.error(`[inventory] getServices failed for "${id}":`, error);
      continue;
    }
    for (const service of services) {
      if (!merged.has(service.slug)) merged.set(service.slug, service);
    }
  }
  return merged.size > 0 ? Array.from(merged.values()) : null;
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
  const [catalog, disabledRows] = await Promise.all([
    loadServiceCatalog(),
    prisma.serviceSetting.findMany({ where: { enabled: false } }),
  ]);
  if (!catalog) return [];

  const disabled = new Set(disabledRows.map((row) => row.slug));
  const services = catalog.filter((service) => !disabled.has(service.slug));

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

export interface CatalogHighlights {
  /** The cheapest a customer can buy any number for right now, or null
   *  with no supplier connected or no service currently priceable. */
  startingPriceKobo: number | null;
  /** How many countries the supplier can currently sell in, or null when
   *  that could not be determined. */
  countryCount: number | null;
}

/**
 * The handful of figures the homepage hero states about the whole catalog:
 * a starting price and a location count. Both go through the same
 * provider methods and the same pricing engine as everywhere else, so
 * neither can drift from what a customer would actually be quoted.
 */
export async function getCatalogHighlights(): Promise<CatalogHighlights> {
  const empty: CatalogHighlights = { startingPriceKobo: null, countryCount: null };

  const [rules, disabledRows, cacheFresh, defaultCurrency] = await Promise.all([
    loadMarginRules(),
    prisma.serviceSetting.findMany({ where: { enabled: false } }),
    anyProviderCacheFresh(),
    getDefaultCurrency(),
  ]);
  const disabled = new Set(disabledRows.map((row) => row.slug));

  // The homepage renders this for every visitor, so it reads the synced
  // cache rather than calling the live supplier on every page view. The
  // one live call this file makes unconditionally is quotePair(), for the
  // one thing that must never be cached: what a customer is actually
  // charged. The cache read below is not scoped to one provider: a pair two
  // providers both offer contributes both rows, and the cheapest naturally
  // wins since only the minimum price is kept.
  if (cacheFresh) {
    const rows = await prisma.syncedOffer.findMany({
      where: { serviceSlug: { notIn: [...disabled] } },
      select: { serviceSlug: true, costUsdCents: true, countrySlug: true },
    });
    if (rows.length > 0) {
      let startingPriceKobo: number | null = null;
      const countrySlugs = new Set<string>();
      for (const row of rows) {
        countrySlugs.add(row.countrySlug);
        if (!isUsableUsdCost(row.costUsdCents)) continue;
        const quote = quoteForCurrency(rules, row.costUsdCents, row.serviceSlug, defaultCurrency);
        if (startingPriceKobo === null || quote.customerPriceKobo < startingPriceKobo) {
          startingPriceKobo = quote.customerPriceKobo;
        }
      }
      return { startingPriceKobo, countryCount: countrySlugs.size };
    }
  }

  const providers = await getEnabledProviders();
  if (providers.length === 0) return empty;

  let startingPriceKobo: number | null = null;
  // Not a true union count across providers (that would need each
  // provider's actual country set, not just a count), so this takes the
  // largest any one provider reports: an honest lower bound on "how many
  // locations", rather than assembling a precise total nobody asked for.
  let countryCount: number | null = null;

  for (const { id, provider } of providers) {
    const [cheapestByService, providerCountryCount] = await Promise.all([
      provider.getCheapestCostByService?.().catch(() => new Map<string, number>()) ??
        Promise.resolve(new Map<string, number>()),
      provider.getCountryCount?.().catch(() => null) ?? Promise.resolve(null),
    ]).catch((error) => {
      console.error(`[inventory] getCatalogHighlights failed for "${id}":`, error);
      return [new Map<string, number>(), null] as const;
    });

    for (const [slug, costUsdCents] of cheapestByService) {
      if (disabled.has(slug) || !isUsableUsdCost(costUsdCents)) continue;
      const quote = quoteForCurrency(rules, costUsdCents, slug, defaultCurrency);
      if (startingPriceKobo === null || quote.customerPriceKobo < startingPriceKobo) {
        startingPriceKobo = quote.customerPriceKobo;
      }
    }
    if (providerCountryCount !== null) {
      countryCount = countryCount === null ? providerCountryCount : Math.max(countryCount, providerCountryCount);
    }
  }

  return { startingPriceKobo, countryCount };
}

/** How many services are on sale. Zero with no supplier connected, which
 *  is what the marketing pages render their empty state from. */
export async function countServices(): Promise<number> {
  const [catalog, disabledRows] = await Promise.all([
    loadServiceCatalog(),
    prisma.serviceSetting.findMany({ where: { enabled: false } }),
  ]);
  if (!catalog) return 0;

  const disabled = new Set(disabledRows.map((row) => row.slug));
  return catalog.filter((service) => !disabled.has(service.slug)).length;
}

/** Display metadata for one service, or null when it cannot be sold. */
export async function getServiceMeta(
  serviceSlug: string,
): Promise<InventoryService | null> {
  const [catalog, setting] = await Promise.all([
    loadServiceCatalog(),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
  ]);
  if (!catalog || setting?.enabled === false) return null;

  const service = catalog.find((row) => row.slug === serviceSlug);
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
  currency: CurrencyConfigEntry,
): Promise<InventoryCountry[]> {
  const [rules, serviceSetting, cacheFresh] = await Promise.all([
    loadMarginRules(),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
    anyProviderCacheFresh(),
  ]);
  if (serviceSetting?.enabled === false) return [];

  // Priced from cost read at read time, not from the price the sync wrote:
  // availability and cost only need to be as fresh as the last sync, but a
  // margin rule (or the currency being quoted for) an admin changes a
  // minute ago should not wait for the next sync to take effect anywhere it
  // is shown.
  type CostOffer = {
    country: {
      slug: string;
      name: string;
      flag: string;
      dialCode: string;
      nationalDigits: number;
    };
    costUsdCents: number;
    stock: string;
    successRate?: number;
  };

  let offers: CostOffer[] | null = null;
  if (cacheFresh) {
    const cached = await prisma.syncedOffer.findMany({ where: { serviceSlug } });
    if (cached.length > 0) {
      // More than one provider can have a row for the same country; the
      // customer sees one row per country, priced from whichever provider
      // is cheapest for that country right now, the same rule quotePair()
      // applies live at purchase time. Cost is always USD here, so this
      // comparison is currency-agnostic regardless of who is asking.
      const cheapestByCountry = new Map<string, (typeof cached)[number]>();
      for (const row of cached) {
        const existing = cheapestByCountry.get(row.countrySlug);
        if (!existing || row.costUsdCents < existing.costUsdCents) {
          cheapestByCountry.set(row.countrySlug, row);
        }
      }
      offers = Array.from(cheapestByCountry.values()).map((row) => ({
        country: {
          slug: row.countrySlug,
          name: row.countryName,
          flag: row.countryFlag,
          dialCode: row.dialCode,
          nationalDigits: row.nationalDigits,
        },
        costUsdCents: row.costUsdCents,
        stock: row.stock,
      }));
    }
  }

  if (!offers) {
    const providers = await getEnabledProviders();
    if (providers.length === 0) return [];

    const cheapestByCountry = new Map<string, CostOffer>();
    for (const { id, provider } of providers) {
      let rows;
      try {
        rows = await provider.getCountries(serviceSlug);
      } catch (error) {
        console.error(`[inventory] getCountries failed for "${id}"/"${serviceSlug}":`, error);
        continue;
      }
      for (const offer of rows) {
        const existing = cheapestByCountry.get(offer.country.slug);
        if (!existing || offer.costUsdCents < existing.costUsdCents) {
          cheapestByCountry.set(offer.country.slug, {
            country: offer.country,
            costUsdCents: offer.costUsdCents,
            stock: offer.stock,
            successRate: offer.successRate,
          });
        }
      }
    }
    offers = Array.from(cheapestByCountry.values());
  }

  return offers
    .filter((offer) => offer.stock !== "out_of_stock")
    .flatMap((offer) => {
      if (!isUsableUsdCost(offer.costUsdCents)) return [];
      const quote = quoteForCurrency(rules, offer.costUsdCents, serviceSlug, currency);
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
 *
 * With more than one provider enabled, every one of them is asked for this
 * exact pair, live, in parallel with each other's lookup failing
 * independently: one provider being down or not carrying this pair does
 * not stop a cheaper or only remaining provider from selling it. Among the
 * providers that can actually sell it right now, the cheapest wins; a tie
 * goes to whichever sorts first by admin-configured priority. The winning
 * provider's id (and its own service/country ids, for the order record) are
 * returned so a purchase can be sent to that exact provider afterward, not
 * to whichever provider happens to resolve first at that later moment.
 */
export async function quotePair(
  serviceSlug: string,
  countrySlug: string,
  currency: CurrencyConfigEntry,
): Promise<QuoteResult> {
  const [providers, rules, serviceSetting] = await Promise.all([
    getEnabledProviders(),
    loadMarginRules(),
    prisma.serviceSetting.findUnique({ where: { slug: serviceSlug } }),
  ]);

  if (providers.length === 0) return { ok: false, reason: "no_provider" };
  if (serviceSetting?.enabled === false) return { ok: false, reason: "disabled" };

  interface Candidate {
    providerId: string;
    offer: ProviderAvailability;
    service: ProviderService;
  }

  const candidates: Candidate[] = [];
  let anyProviderErrored = false;
  let sawUnpriceableOffer = false;

  // providers is already sorted by ascending priority (see
  // getEnabledProviders), and candidates are pushed in that same order, so
  // a cost tie below resolves to the higher-priority provider without a
  // separate tie-break rule.
  for (const { id, provider } of providers) {
    let offer;
    let services;
    try {
      [offer, services] = await Promise.all([
        provider.getAvailability(serviceSlug, countrySlug),
        provider.getServices(),
      ]);
    } catch (error) {
      anyProviderErrored = true;
      console.error(
        `[inventory] live lookup failed for "${serviceSlug}" in "${countrySlug}" via "${id}":`,
        error,
      );
      continue;
    }

    const service = services.find((row) => row.slug === serviceSlug);
    if (!offer || !service || offer.stock === "out_of_stock") continue;

    // No usable cost means no knowable margin, so there is no price to
    // quote and nothing to sell from this provider. Refused here rather
    // than guessed, but another provider may still be able to sell it.
    if (!isUsableUsdCost(offer.costUsdCents)) {
      console.error(
        `[inventory] refusing to price "${serviceSlug}" in "${countrySlug}" via "${id}": ` +
          `provider returned an unusable cost (${offer.costUsdCents})`,
      );
      sawUnpriceableOffer = true;
      continue;
    }

    candidates.push({ providerId: id, offer, service });
  }

  if (candidates.length === 0) {
    if (anyProviderErrored && !sawUnpriceableOffer) return { ok: false, reason: "provider_error" };
    if (sawUnpriceableOffer) return { ok: false, reason: "unpriceable" };
    return { ok: false, reason: "unavailable" };
  }

  const winner = candidates.reduce((best, candidate) =>
    candidate.offer.costUsdCents < best.offer.costUsdCents ? candidate : best,
  );

  const quote = quoteForCurrency(rules, winner.offer.costUsdCents, serviceSlug, currency);

  return {
    ok: true,
    quote,
    provider: winner.providerId,
    providerServiceId: winner.service.providerServiceId,
    providerCountryId: winner.offer.country.providerCountryId,
    service: toInventoryService(winner.service),
    country: {
      slug: winner.offer.country.slug,
      name: winner.offer.country.name,
      flag: winner.offer.country.flag,
      dialCode: winner.offer.country.dialCode,
      nationalDigits: winner.offer.country.nationalDigits,
      priceKobo: quote.customerPriceKobo,
      successRate: winner.offer.successRate,
    },
  };
}
