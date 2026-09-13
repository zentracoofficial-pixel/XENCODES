import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SETTING_KEYS, DEFAULT_GLOBAL_MARKUP_PERCENT } from "@/lib/settings";
import { getProvider, developmentProvider } from "@/lib/provider";
import type { ProviderCountry, ProviderService, ProviderOffer, StockLevel } from "@/lib/provider";

export const CATALOG_TAG = "catalog";

/** Call after any admin change that affects what customers see or pay. */
export function revalidateCatalog() {
  revalidateTag(CATALOG_TAG, "max");
}

/** One buyable option, after admin pricing and availability are applied. */
export interface CatalogOffer {
  countrySlug: string;
  countryName: string;
  flag: string;
  dialCode: string;
  /** Digits after the dial code, used to show the number format. */
  nationalDigits: number;
  priceNaira: number;
  stock: StockLevel;
  stockCount?: number;
  avgDeliverySeconds: number;
  successRate: number;
}

export interface CatalogService {
  slug: string;
  name: string;
  color: string;
  category: string;
  /** Cheapest live country for this service, whole Naira. */
  priceFromNaira: number;
  offers: CatalogOffer[];
}

export interface Catalog {
  services: CatalogService[];
  countries: (ProviderCountry & { serviceCount: number; priceFromNaira: number })[];
  categories: string[];
  /** Cheapest price anywhere in the catalog. */
  floorNaira: number;
  globalMarkupPercent: number;
  /** False while the development adapter is serving the catalog. */
  isLive: boolean;
  providerLabel: string;
}

/** Keeps marked up prices on tidy 5 Naira steps. */
export function applyMarkup(priceNaira: number, percent: number) {
  if (!percent) return priceNaira;
  return Math.round((priceNaira * (100 + percent)) / 100 / 5) * 5;
}

/**
 * A starting per-category markup bonus, stacked on top of the global
 * percent, applied only until an admin sets an explicit per-service value
 * on /admin/services (which always wins, same pattern as
 * DEFAULT_GLOBAL_MARKUP_PERCENT). This is not derived from live SMSPool
 * cost data - there is no way to fetch every service's real cost without
 * pricing the entire catalog, which is exactly what KNOWN_SERVICE_NAMES in
 * smspool.ts avoids. It is a defensible starting heuristic instead: more
 * margin on identity-critical categories a customer needs urgently and
 * shops around for less (social/messaging, finance/crypto - PayPal,
 * Binance, Wise and the like, for KYC and account recovery), a smaller
 * bump on categories with some urgency but more alternatives, and none on
 * commodity or long-tail categories where staying competitive matters more
 * than squeezing margin.
 */
const CATEGORY_MARKUP_BONUS: Record<string, number> = {
  "Social & Messaging": 10,
  "Finance & Crypto": 10,
  "Dating": 5,
  "Marketplaces & Freelance": 5,
  "Developer & Cloud": 5,
  "Entertainment": 0,
  "Travel & Delivery": 0,
  "Other": 0,
};

export function defaultServiceMarkupBonus(category: string) {
  return CATEGORY_MARKUP_BONUS[category] ?? 0;
}

async function resolveCatalog(): Promise<Catalog> {
  const provider = await getProvider();

  const [serviceSettings, countrySettings, markupRow] = await Promise.all([
    prisma.serviceSetting.findMany(),
    prisma.countrySetting.findMany(),
    prisma.setting.findUnique({ where: { key: SETTING_KEYS.globalMarkupPercent } }),
  ]);

  let providerServices: ProviderService[];
  let providerCountries: ProviderCountry[];
  let providerOffers: ProviderOffer[];
  let isLive = provider.isLive;
  let providerLabel = provider.label;

  try {
    [providerServices, providerCountries, providerOffers] = await Promise.all([
      provider.listServices(),
      provider.listCountries(),
      provider.listOffers(),
    ]);
  } catch (error) {
    // A live provider hiccup (timeout, rate limit, outage) must never take
    // the whole storefront down with it. Fall back to the bundled sample
    // catalog so every page still renders something, clearly marked as not
    // live, and self-heals on the next cache window once the provider
    // recovers.
    console.error("[catalog] live provider failed, falling back to sample data:", error);
    [providerServices, providerCountries, providerOffers] = await Promise.all([
      developmentProvider.listServices(),
      developmentProvider.listCountries(),
      developmentProvider.listOffers(),
    ]);
    isLive = false;
    providerLabel = `${provider.label} (temporarily unavailable)`;
  }

  const serviceSettingBySlug = new Map(serviceSettings.map((s) => [s.slug, s]));
  const countrySettingBySlug = new Map(countrySettings.map((c) => [c.slug, c]));
  // No row yet means no admin has ever touched this: apply the starting
  // default rather than accidentally selling at cost. Once a row exists
  // (even "0"), it always wins over the default.
  const globalMarkupPercent = markupRow
    ? Number(markupRow.value) || 0
    : DEFAULT_GLOBAL_MARKUP_PERCENT;

  const countryBySlug = new Map(providerCountries.map((c) => [c.slug, c]));
  const disabledCountries = new Set(
    providerCountries
      .filter((c) => countrySettingBySlug.get(c.slug)?.enabled === false)
      .map((c) => c.slug),
  );

  const offersByService = new Map<string, typeof providerOffers>();
  for (const offer of providerOffers) {
    if (disabledCountries.has(offer.countrySlug)) continue;
    if (offer.stock === "out_of_stock") continue;
    const list = offersByService.get(offer.serviceSlug) ?? [];
    list.push(offer);
    offersByService.set(offer.serviceSlug, list);
  }

  const services: CatalogService[] = providerServices
    .filter((service) => serviceSettingBySlug.get(service.slug)?.enabled !== false)
    .map((service) => {
      const markup =
        globalMarkupPercent +
        (serviceSettingBySlug.get(service.slug)?.markupPercent ??
          defaultServiceMarkupBonus(service.category));

      const offers: CatalogOffer[] = (offersByService.get(service.slug) ?? [])
        .flatMap((offer) => {
          const country = countryBySlug.get(offer.countrySlug);
          if (!country) return [];
          return [
            {
              countrySlug: country.slug,
              countryName: country.name,
              flag: country.flag,
              dialCode: country.dialCode,
              nationalDigits: country.nationalDigits,
              priceNaira: applyMarkup(offer.priceNaira, markup),
              stock: offer.stock,
              stockCount: offer.stockCount,
              avgDeliverySeconds: offer.avgDeliverySeconds,
              successRate: offer.successRate,
            },
          ];
        })
        .sort((a, b) => a.priceNaira - b.priceNaira);

      return {
        slug: service.slug,
        name: service.name,
        color: service.color,
        category: service.category,
        priceFromNaira: offers.length ? offers[0].priceNaira : 0,
        offers,
      };
    })
    // A service with nothing left to sell should not be listed at all.
    .filter((service) => service.offers.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const countries = providerCountries
    .filter((country) => !disabledCountries.has(country.slug))
    .map((country) => {
      const prices = services
        .flatMap((s) => s.offers)
        .filter((o) => o.countrySlug === country.slug)
        .map((o) => o.priceNaira);

      return {
        ...country,
        serviceCount: prices.length,
        priceFromNaira: prices.length ? Math.min(...prices) : 0,
      };
    })
    .filter((country) => country.serviceCount > 0);

  const floors = services.map((s) => s.priceFromNaira).filter((p) => p > 0);

  return {
    services,
    countries,
    categories: Array.from(new Set(services.map((s) => s.category))).sort(),
    floorNaira: floors.length ? Math.min(...floors) : 0,
    globalMarkupPercent,
    isLive,
    providerLabel,
  };
}

/**
 * Customer facing catalog: provider inventory with admin overrides applied.
 * Cached so pages stay fast, and cleared immediately by revalidateCatalog()
 * whenever an admin changes availability or pricing. The window is 5 minutes
 * rather than something tighter because a live provider can mean dozens of
 * outbound requests to resolve the full catalog, not just a database read.
 */
export const getCatalog = unstable_cache(resolveCatalog, ["catalog-v2"], {
  tags: [CATALOG_TAG],
  revalidate: 300,
});

export async function getServiceBySlug(slug: string) {
  const { services } = await getCatalog();
  return services.find((service) => service.slug === slug);
}

export async function getOffer(serviceSlug: string, countrySlug: string) {
  const service = await getServiceBySlug(serviceSlug);
  if (!service) return null;
  const offer = service.offers.find((o) => o.countrySlug === countrySlug);
  return offer ? { service, offer } : null;
}

/**
 * Every service the provider lists, admin-disabled ones excluded, with no
 * price attached. Cheap: provider.listServices() is already cached at the
 * provider layer. Used by the /services directory to show the provider's
 * real full catalog, not only the smaller eagerly-priced subset getCatalog()
 * computes (see SmsPoolProvider's KNOWN_SERVICE_NAMES).
 */
export async function getAllServices(): Promise<ProviderService[]> {
  const [provider, serviceSettings] = await Promise.all([
    getProvider(),
    prisma.serviceSetting.findMany(),
  ]);
  const serviceSettingBySlug = new Map(serviceSettings.map((s) => [s.slug, s]));

  try {
    const services = await provider.listServices();
    return services.filter(
      (service) => serviceSettingBySlug.get(service.slug)?.enabled !== false,
    );
  } catch (error) {
    console.error("[catalog] listServices failed, falling back to sample data:", error);
    return developmentProvider.listServices();
  }
}

/**
 * Resolves one service for the buy flow. Tries the already-cached, eagerly
 * priced catalog first (the fast path: no extra live calls for anything
 * getCatalog() already prices). Falls back to pricing that one service live,
 * on demand, for anything outside that set - this is what makes the
 * provider's entire catalog buyable rather than only what gets eagerly
 * precomputed for everyone on every cache refresh.
 */
export async function getServiceForBuy(slug: string): Promise<CatalogService | null> {
  const catalog = await getCatalog();
  const fast = catalog.services.find((service) => service.slug === slug);
  if (fast) return fast;

  const provider = await getProvider();
  const [allServices, serviceSettings, countrySettings, markupRow, countries] =
    await Promise.all([
      provider.listServices(),
      prisma.serviceSetting.findMany(),
      prisma.countrySetting.findMany(),
      prisma.setting.findUnique({ where: { key: SETTING_KEYS.globalMarkupPercent } }),
      provider.listCountries(),
    ]);

  const meta = allServices.find((service) => service.slug === slug);
  if (!meta) return null;

  const serviceSetting = serviceSettings.find((s) => s.slug === slug);
  if (serviceSetting?.enabled === false) return null;

  let rawOffers: ProviderOffer[];
  try {
    rawOffers = await provider.listOffersForService(slug);
  } catch (error) {
    console.error(`[catalog] on-demand pricing failed for "${slug}":`, error);
    rawOffers = [];
  }

  const countrySettingBySlug = new Map(countrySettings.map((c) => [c.slug, c]));
  const countryBySlug = new Map(countries.map((c) => [c.slug, c]));
  const globalMarkupPercent = markupRow
    ? Number(markupRow.value) || 0
    : DEFAULT_GLOBAL_MARKUP_PERCENT;
  const markup =
    globalMarkupPercent +
    (serviceSetting?.markupPercent ?? defaultServiceMarkupBonus(meta.category));

  const offers: CatalogOffer[] = rawOffers
    .filter((offer) => offer.stock !== "out_of_stock")
    .filter((offer) => countrySettingBySlug.get(offer.countrySlug)?.enabled !== false)
    .flatMap((offer) => {
      const country = countryBySlug.get(offer.countrySlug);
      if (!country) return [];
      return [
        {
          countrySlug: country.slug,
          countryName: country.name,
          flag: country.flag,
          dialCode: country.dialCode,
          nationalDigits: country.nationalDigits,
          priceNaira: applyMarkup(offer.priceNaira, markup),
          stock: offer.stock,
          stockCount: offer.stockCount,
          avgDeliverySeconds: offer.avgDeliverySeconds,
          successRate: offer.successRate,
        },
      ];
    })
    .sort((a, b) => a.priceNaira - b.priceNaira);

  return {
    slug: meta.slug,
    name: meta.name,
    color: meta.color,
    category: meta.category,
    priceFromNaira: offers.length ? offers[0].priceNaira : 0,
    offers,
  };
}

/** Same as getOffer(), but through getServiceForBuy()'s on-demand fallback,
 *  so a purchase of a service outside the eagerly priced set still works. */
export async function getOfferForBuy(serviceSlug: string, countrySlug: string) {
  const service = await getServiceForBuy(serviceSlug);
  if (!service) return null;
  const offer = service.offers.find((o) => o.countrySlug === countrySlug);
  return offer ? { service, offer } : null;
}

/**
 * The one live, uncached price check in the whole pricing chain. Everything
 * above this point (getCatalog(), getServiceForBuy()) is cached for minutes
 * at a time so pages stay fast to render - fine for browsing, not fine for
 * the instant a customer actually pays. This recomputes the exact same
 * markup those paths would apply, but against a fresh provider.getLivePrice()
 * call made right now, so purchaseNumberAction can charge what the provider
 * is really quoting at that moment instead of a snapshot that can be
 * PROVIDER_CACHE_SECONDS old. Returns null if the pair is disabled or the
 * provider says it is not actually available right now, even if a stale
 * cache still lists it as buyable.
 */
export async function getLiveOfferPrice(
  serviceSlug: string,
  countrySlug: string,
): Promise<number | null> {
  const provider = await getProvider();

  const [allServices, serviceSettings, countrySettings, markupRow] = await Promise.all([
    provider.listServices(),
    prisma.serviceSetting.findMany(),
    prisma.countrySetting.findMany(),
    prisma.setting.findUnique({ where: { key: SETTING_KEYS.globalMarkupPercent } }),
  ]);

  const meta = allServices.find((service) => service.slug === serviceSlug);
  if (!meta) return null;

  const serviceSetting = serviceSettings.find((s) => s.slug === serviceSlug);
  if (serviceSetting?.enabled === false) return null;
  if (countrySettings.find((c) => c.slug === countrySlug)?.enabled === false) return null;

  let rawNaira: number | null;
  try {
    rawNaira = await provider.getLivePrice(serviceSlug, countrySlug);
  } catch (error) {
    console.error(
      `[catalog] live price check failed for "${serviceSlug}" in "${countrySlug}":`,
      error,
    );
    return null;
  }
  if (rawNaira === null) return null;

  const globalMarkupPercent = markupRow
    ? Number(markupRow.value) || 0
    : DEFAULT_GLOBAL_MARKUP_PERCENT;
  const markup =
    globalMarkupPercent +
    (serviceSetting?.markupPercent ?? defaultServiceMarkupBonus(meta.category));

  return applyMarkup(rawNaira, markup);
}
