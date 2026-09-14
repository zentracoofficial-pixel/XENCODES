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

/**
 * A serverless function has a hard execution ceiling (10s on Vercel's
 * default tier, and this project sets no maxDuration override), enforced
 * by the platform itself, not by any try/catch in this file. The provider
 * calls below already catch real errors and fall back to sample data - but
 * a *slow* provider is not an error, it is a pending promise, and awaiting
 * one for too long means the platform kills the whole request before that
 * catch block ever runs. That produces exactly the failure a customer
 * cannot tell apart from "the site is broken": no fallback render, no
 * error boundary, nothing.
 *
 * This matters most right after a fresh deploy or right after the
 * provider-level cache in smspool.ts turns over (every 45 minutes): the
 * very first request to land in that window is the one that pays for a
 * full live resolution, and if SMSPool happens to be unusually slow at
 * that exact moment, that one request was at risk of taking the whole
 * page down with it rather than just showing slightly stale or sample
 * data. Racing the live call against this budget turns "occasionally
 * times out with nothing rendered" into "occasionally serves sample data
 * for one request", which is the graceful degradation resolveCatalog()
 * was always supposed to guarantee.
 *
 * This is a backstop against SMSPool itself being slow, not the thing
 * sizing how much work fetchOffers() does: an earlier version of this
 * pass tried to eagerly price 32 countries against a ~124-name service
 * list, which is thousands of live calls and could never finish in 8
 * seconds regardless of this constant - it hit this timeout on every
 * single cold cache, permanently serving the sample catalog. The real
 * fix was shrinking that workload (see PRIORITY_COUNTRY_NAMES and
 * isCuratedService() in smspool.ts) until it reliably finishes in a
 * couple of seconds; this budget only needs to catch the genuinely
 * unusual case of SMSPool itself being slow to answer that small a
 * workload.
 */
const LIVE_PROVIDER_BUDGET_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${what} did not respond within ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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
  /** Only present when the provider actually reports it. Never invented,
   *  so the UI must treat "missing" as "we do not know", not as zero. */
  avgDeliverySeconds?: number;
  successRate?: number;
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
 * pricing the entire catalog, which is exactly what the curated eager set
 * in smspool.ts avoids. It is a defensible starting heuristic instead: more
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
    [providerServices, providerCountries, providerOffers] = await withTimeout(
      Promise.all([provider.listServices(), provider.listCountries(), provider.listOffers()]),
      LIVE_PROVIDER_BUDGET_MS,
      "the number provider",
    );
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

  // Every country the provider sells in, minus the ones an admin switched
  // off. Deliberately not filtered down to countries the eager pass happened
  // to price: that pass is bounded to a priority subset (see
  // PRIORITY_COUNTRY_NAMES), so filtering on it would both understate how
  // many countries the site actually covers and leave the rest without a
  // flag to render once a customer buys a number in one of them.
  // serviceCount here therefore means "priced in the eager pass", not
  // "everything available", which is why nothing user-facing counts it.
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
    });

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
 * computes (see SmsPoolProvider's isCuratedService() and
 * PRIORITY_COUNTRY_NAMES).
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
 * Resolves one service for the buy flow, priced across every country the
 * provider offers it in.
 *
 * Deliberately does NOT short-circuit to the eagerly priced catalog when it
 * has an entry for this service. That entry only covers the bounded
 * priority-country subset the eager pass has time to precompute (see
 * PRIORITY_COUNTRY_NAMES in smspool.ts), so reading from it here made the
 * buy page understate real availability badly: Booking.com, priced eagerly,
 * offered 5 countries on the page while SMSPool actually had it in far
 * more. The eager pass exists to make the homepage and instant search fast
 * and broad; the buy page is where a customer needs the real, complete
 * list, so it always asks the provider for this one service directly. That
 * is one call per country for a single service, and cached per service, so
 * the cost is bounded and paid once per refresh window.
 *
 * If that live sweep comes back empty (provider down, everything sold out),
 * the eagerly priced entry is used as a fallback rather than showing the
 * customer nothing.
 */
export async function getServiceForBuy(slug: string): Promise<CatalogService | null> {
  const provider = await getProvider();

  let allServices: ProviderService[];
  let countries: ProviderCountry[];
  let serviceSettings: Awaited<ReturnType<typeof prisma.serviceSetting.findMany>>;
  let countrySettings: Awaited<ReturnType<typeof prisma.countrySetting.findMany>>;
  let markupRow: Awaited<ReturnType<typeof prisma.setting.findUnique>>;
  try {
    [allServices, serviceSettings, countrySettings, markupRow, countries] = await withTimeout(
      Promise.all([
        provider.listServices(),
        prisma.serviceSetting.findMany(),
        prisma.countrySetting.findMany(),
        prisma.setting.findUnique({ where: { key: SETTING_KEYS.globalMarkupPercent } }),
        provider.listCountries(),
      ]),
      LIVE_PROVIDER_BUDGET_MS,
      "the number provider",
    );
  } catch (error) {
    // Same reasoning as resolveCatalog(): a slow provider must degrade to
    // whatever the eager pass already has cached, never hang the buy page
    // until the platform kills the request outright.
    console.error(`[catalog] provider lookup failed for "${slug}":`, error);
    const catalog = await getCatalog();
    return catalog.services.find((service) => service.slug === slug) ?? null;
  }

  const meta = allServices.find((service) => service.slug === slug);
  if (!meta) return null;

  const serviceSetting = serviceSettings.find((s) => s.slug === slug);
  if (serviceSetting?.enabled === false) return null;

  let rawOffers: ProviderOffer[];
  try {
    rawOffers = await withTimeout(
      provider.listOffersForService(slug),
      LIVE_PROVIDER_BUDGET_MS,
      "the number provider",
    );
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

  // Nothing came back live. Rather than tell the customer this service has
  // no countries at all, fall back to whatever the eager pass last priced
  // for it, which is at worst a narrower but real list.
  if (offers.length === 0) {
    const catalog = await getCatalog();
    const eager = catalog.services.find((service) => service.slug === slug);
    if (eager) return eager;
  }

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
