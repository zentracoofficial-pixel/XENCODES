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
        (serviceSettingBySlug.get(service.slug)?.markupPercent ?? 0);

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
