import { cache } from "react";
import { getCountryServices, getServiceCountryOffers } from "@/lib/inventory";
import { getDefaultCurrency } from "@/lib/currency-config";
import { parseCountryVariant } from "@/lib/country-variant";
import { getSeoIndex } from "@/lib/seo-catalog";

/**
 * Page data for the public service, country and service-in-country pages.
 * Each loader is wrapped in React's cache(), so a page and its generateMetadata
 * share one read instead of making two.
 */

export const loadSeoService = cache(async (slug: string) => {
  const currency = await getDefaultCurrency();
  const [offers, index] = await Promise.all([getServiceCountryOffers(slug, currency), getSeoIndex()]);
  const entry = index.services.find((service) => service.slug === slug) ?? null;
  return { offers, entry };
});

export const loadSeoCountry = cache(async (slug: string) => {
  // "usa-2" is a repeat listing of "usa", not a place of its own.
  if (parseCountryVariant(slug.replace(/-/g, " ")).variant > 1 || /-\d+$/.test(slug)) return null;
  const currency = await getDefaultCurrency();
  const [offers, index] = await Promise.all([getCountryServices(slug, currency), getSeoIndex()]);
  if (!offers) return null;
  const entry = index.countries.find((country) => country.slug === slug) ?? null;
  return { offers, entry };
});

/** Whether a service-in-country page is one search engines should be offered. */
export const isIndexedPair = cache(async (service: string, country: string) => {
  const index = await getSeoIndex();
  return index.pairs.some((pair) => pair.service === service && pair.country === country);
});
