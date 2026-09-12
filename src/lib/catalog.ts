import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { services as baseServices, catalogFloorNaira as baseFloor } from "@/data/services";
import { countries as baseCountries } from "@/data/countries";
import { SETTING_KEYS } from "@/lib/settings";
import type { Country, Service } from "@/data/types";

export const CATALOG_TAG = "catalog";

/** Call after any admin change that affects what customers see or pay. */
export function revalidateCatalog() {
  revalidateTag(CATALOG_TAG, "max");
}

export interface ResolvedCatalog {
  services: Service[];
  countries: Country[];
  floorNaira: number;
  globalMarkupPercent: number;
}

/** Exported so admin previews (services/countries/pricing) can mirror the live math. */
export function applyMarkup(priceNaira: number, percent: number) {
  if (!percent) return priceNaira;
  // Keep prices on tidy ₦5 steps after marking up.
  return Math.round((priceNaira * (100 + percent)) / 100 / 5) * 5;
}

async function resolveCatalog(): Promise<ResolvedCatalog> {
  const [serviceSettings, countrySettings, settingRows] = await Promise.all([
    prisma.serviceSetting.findMany(),
    prisma.countrySetting.findMany(),
    prisma.setting.findMany({ where: { key: SETTING_KEYS.globalMarkupPercent } }),
  ]);

  const serviceBySlug = new Map(serviceSettings.map((s) => [s.slug, s]));
  const countryBySlug = new Map(countrySettings.map((c) => [c.slug, c]));
  const globalMarkupPercent = Number(settingRows[0]?.value ?? 0) || 0;

  const disabledCountries = new Set(
    baseCountries
      .filter((c) => countryBySlug.get(c.slug)?.enabled === false)
      .map((c) => c.slug),
  );

  const services = baseServices
    .filter((service) => serviceBySlug.get(service.slug)?.enabled !== false)
    .map((service) => {
      const markup =
        globalMarkupPercent + (serviceBySlug.get(service.slug)?.markupPercent ?? 0);

      const availability = service.availability.map((entry) =>
        disabledCountries.has(entry.countrySlug)
          ? { ...entry, status: "unavailable" as const, priceNaira: 0 }
          : { ...entry, priceNaira: applyMarkup(entry.priceNaira, markup) },
      );

      const livePrices = availability
        .filter((a) => a.status !== "unavailable")
        .map((a) => a.priceNaira);

      return {
        ...service,
        availability,
        priceFromNaira: livePrices.length ? Math.min(...livePrices) : 0,
      };
    })
    // A service with every country switched off shouldn't be listed at all.
    .filter((service) => service.priceFromNaira > 0);

  const countries = baseCountries
    .filter((country) => !disabledCountries.has(country.slug))
    .map((country) => {
      const prices = services
        .flatMap((s) => s.availability)
        .filter((a) => a.countrySlug === country.slug && a.status !== "unavailable")
        .map((a) => a.priceNaira);

      return {
        ...country,
        priceFromNaira: prices.length ? Math.min(...prices) : country.priceFromNaira,
        serviceCount: services.filter((s) =>
          s.availability.some(
            (a) => a.countrySlug === country.slug && a.status !== "unavailable",
          ),
        ).length,
      };
    })
    .filter((country) => country.serviceCount > 0);

  const floors = services.map((s) => s.priceFromNaira).filter((p) => p > 0);

  return {
    services,
    countries,
    floorNaira: floors.length ? Math.min(...floors) : baseFloor,
    globalMarkupPercent,
  };
}

/**
 * Customer-facing catalog: static definitions merged with admin overrides.
 * Cached so marketing pages stay fast, and invalidated by revalidateCatalog()
 * whenever an admin changes availability or pricing.
 */
export const getCatalog = unstable_cache(resolveCatalog, ["catalog-v1"], {
  tags: [CATALOG_TAG],
});

export async function getServiceBySlugResolved(slug: string) {
  const { services } = await getCatalog();
  return services.find((service) => service.slug === slug);
}

export async function getCountryBySlugResolved(slug: string) {
  const { countries } = await getCatalog();
  return countries.find((country) => country.slug === slug);
}
