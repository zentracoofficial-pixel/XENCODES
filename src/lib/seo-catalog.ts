import { prisma } from "@/lib/prisma";
import { readProviderConfig } from "@/lib/provider";
import { isRestrictedService } from "@/lib/restricted-services";
import { parseCountryVariant, compareCountryNames } from "@/lib/country-variant";
import { getDisplayRates } from "@/lib/exchange-rates";
import { convertNgnMinor, formatNgnForDisplay } from "@/lib/display-currency";
import { formatMoney } from "@/lib/currency";

/**
 * What the public, search-engine-facing pages are built from: the synced
 * catalog (no supplier request), reduced to the pages worth indexing.
 *
 * Pages are made only where there is something real to say: a service page
 * needs numbers in at least MIN_COUNTRIES_FOR_SERVICE_PAGE countries, a
 * country page needs at least MIN_SERVICES_FOR_COUNTRY_PAGE services, and a
 * service-in-country page is offered to search engines only for the
 * FEATURED_SERVICE_LIMIT services with the widest reach, in countries that
 * have a page of their own. Every other page still works for a visitor who
 * lands on it, but carries noindex and is left out of the sitemap, so the
 * site never asks Google to index thin or near-duplicate pages.
 */
export const MIN_COUNTRIES_FOR_SERVICE_PAGE = 3;
export const MIN_SERVICES_FOR_COUNTRY_PAGE = 5;
export const FEATURED_SERVICE_LIMIT = 80;

export interface SeoService {
  slug: string;
  name: string;
  countryCount: number;
  featured: boolean;
}

export interface SeoCountry {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  serviceCount: number;
}

export interface SeoIndex {
  services: SeoService[];
  countries: SeoCountry[];
  /** Service-in-country pages that search engines should be offered. */
  pairs: Array<{ service: string; country: string }>;
}

let cached: { at: number; value: SeoIndex } | null = null;
const CACHE_MS = 10 * 60 * 1000;

/** The whole index, read in one query and kept for a few minutes so a burst
 *  of page builds (or the sitemap) does not repeat it. */
export async function getSeoIndex(): Promise<SeoIndex> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const providerIds = (await readProviderConfig()).filter((entry) => entry.enabled).map((entry) => entry.id);
  const [disabledRows, groups] = await Promise.all([
    prisma.serviceSetting.findMany({ where: { enabled: false }, select: { slug: true } }),
    prisma.syncedOffer.groupBy({
      by: ["serviceSlug", "serviceName", "countrySlug", "countryName", "countryFlag", "dialCode"],
      where: { providerId: { in: providerIds }, stock: { not: "out_of_stock" }, costUsdCents: { gt: 0 } },
    }),
  ]);
  const disabled = new Set(disabledRows.map((row) => row.slug));

  const serviceNames = new Map<string, string>();
  const countryInfo = new Map<string, Omit<SeoCountry, "serviceCount">>();
  const servicesByCountry = new Map<string, Set<string>>();
  const countriesByService = new Map<string, Set<string>>();

  for (const row of groups) {
    if (disabled.has(row.serviceSlug) || isRestrictedService(row.serviceSlug, row.serviceName)) continue;
    // A repeat listing ("USA (2)") is the same place as the plain one.
    if (parseCountryVariant(row.countryName).variant > 1) continue;
    serviceNames.set(row.serviceSlug, serviceNames.get(row.serviceSlug) ?? row.serviceName);
    if (!countryInfo.has(row.countrySlug)) {
      countryInfo.set(row.countrySlug, {
        slug: row.countrySlug,
        name: row.countryName,
        flag: row.countryFlag,
        dialCode: row.dialCode,
      });
    }
    (servicesByCountry.get(row.countrySlug) ?? servicesByCountry.set(row.countrySlug, new Set()).get(row.countrySlug)!).add(row.serviceSlug);
    (countriesByService.get(row.serviceSlug) ?? countriesByService.set(row.serviceSlug, new Set()).get(row.serviceSlug)!).add(row.countrySlug);
  }

  const ranked = [...countriesByService.entries()]
    .filter(([, countries]) => countries.size >= MIN_COUNTRIES_FOR_SERVICE_PAGE)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
  const services: SeoService[] = ranked.map(([slug, countries], index) => ({
    slug,
    name: serviceNames.get(slug) ?? slug,
    countryCount: countries.size,
    featured: index < FEATURED_SERVICE_LIMIT,
  }));

  const countries: SeoCountry[] = [...countryInfo.values()]
    .map((country) => ({ ...country, serviceCount: servicesByCountry.get(country.slug)?.size ?? 0 }))
    .filter((country) => country.serviceCount >= MIN_SERVICES_FOR_COUNTRY_PAGE)
    .sort((a, b) => compareCountryNames(a.name, b.name));
  const countryPages = new Set(countries.map((country) => country.slug));

  const pairs: SeoIndex["pairs"] = [];
  for (const service of services) {
    if (!service.featured) continue;
    for (const countrySlug of countriesByService.get(service.slug) ?? []) {
      if (countryPages.has(countrySlug)) pairs.push({ service: service.slug, country: countrySlug });
    }
  }

  const value: SeoIndex = { services, countries, pairs };
  cached = { at: Date.now(), value };
  return value;
}

/** For tests: forget the kept index. */
export function resetSeoIndexForTests() {
  cached = null;
}

export interface SeoMoney {
  /** "$0.45", the price a visitor anywhere reads first. */
  usd: string;
  /** "₦720", the same price in Naira. */
  ngn: string;
  /** 0.45, for structured data; null when there is no exchange rate. */
  usdNumber: number | null;
}

/** Prices shown on public pages: US dollars first, Naira beside it. */
export async function getSeoMoney(): Promise<(ngnKobo: number) => SeoMoney> {
  // Pages served from the cache never schedule a refresh of the rate table
  // (the daily cron and the signed-in pages keep it fresh).
  const rates = await getDisplayRates({ scheduleRefresh: false });
  return (ngnKobo) => {
    const cents = convertNgnMinor(ngnKobo, "USD", rates);
    return {
      usd: formatNgnForDisplay(ngnKobo, "USD", rates),
      ngn: formatMoney(ngnKobo, "NGN"),
      usdNumber: cents === null ? null : Math.round(cents) / 100,
    };
  };
}
