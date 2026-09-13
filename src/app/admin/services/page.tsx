import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/provider";
import { applyMarkup } from "@/lib/catalog";
import {
  readSettings,
  readNumber,
  SETTING_KEYS,
  DEFAULT_GLOBAL_MARKUP_PERCENT,
} from "@/lib/settings";
import { ServiceRow } from "./service-row";
import { CountryRow } from "./country-row";

export const metadata: Metadata = { title: "Admin: Services" };

// See admin/pricing/page.tsx: this page must never be statically
// prerendered, since resolving it makes real outbound requests once a live
// provider is connected.
export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requireAdmin();

  const provider = await getProvider();

  // Each provider call gets its own fallback rather than one shared
  // Promise.all, so a live provider hiccup degrades this page (fewer rows,
  // an empty table) instead of crashing it outright and losing the
  // database reads alongside it.
  const [
    providerServices,
    providerCountries,
    providerOffers,
    serviceSettings,
    countrySettings,
    settings,
  ] = await Promise.all([
    provider.listServices().catch(() => []),
    provider.listCountries().catch(() => []),
    provider.listOffers().catch(() => []),
    prisma.serviceSetting.findMany(),
    prisma.countrySetting.findMany(),
    readSettings(),
  ]);

  const providerUnavailable =
    provider.isLive && providerServices.length === 0 && providerCountries.length === 0;

  const globalMarkupPercent = readNumber(
    settings,
    SETTING_KEYS.globalMarkupPercent,
    DEFAULT_GLOBAL_MARKUP_PERCENT,
  );
  const serviceSettingBySlug = new Map(serviceSettings.map((s) => [s.slug, s]));
  const countrySettingBySlug = new Map(countrySettings.map((c) => [c.slug, c]));

  // Cheapest offer per service, before any markup, so the admin sees the raw
  // number the provider quoted next to what the customer would pay.
  const basePriceBySlug = new Map<string, number>();
  const countryCount = new Map<string, number>();
  for (const offer of providerOffers) {
    const current = basePriceBySlug.get(offer.serviceSlug);
    if (current === undefined || offer.priceNaira < current) {
      basePriceBySlug.set(offer.serviceSlug, offer.priceNaira);
    }
    countryCount.set(
      offer.countrySlug,
      (countryCount.get(offer.countrySlug) ?? 0) + 1,
    );
  }

  const categories = Array.from(
    new Set(providerServices.map((service) => service.category)),
  ).sort();

  const disabledServices = providerServices.filter(
    (s) => serviceSettingBySlug.get(s.slug)?.enabled === false,
  ).length;
  const disabledCountries = providerCountries.filter(
    (c) => countrySettingBySlug.get(c.slug)?.enabled === false,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {providerServices.length} services and {providerCountries.length}{" "}
          countries from {provider.label}. {disabledServices} services and{" "}
          {disabledCountries} countries are switched off. Global markup is{" "}
          {globalMarkupPercent}%, set on the Pricing page, and per-service markup
          stacks on top.
        </p>
      </div>

      {providerUnavailable ? (
        <p className="rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
          {provider.label} did not respond just now, so nothing is shown below.
          This page always reads live rather than from cache, so reloading in
          a moment will try again.
        </p>
      ) : null}

      {/* Countries first: switching one off affects every service. */}
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-background px-5 py-3">
          <h2 className="text-sm font-semibold">Countries</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Switching a country off hides it from checkout across the whole site.
          </p>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
          <tbody>
            {providerCountries.map((country) => (
              <CountryRow
                key={country.slug}
                slug={country.slug}
                name={country.name}
                flag={country.flag}
                dialCode={country.dialCode}
                serviceCount={countryCount.get(country.slug) ?? 0}
                enabled={countrySettingBySlug.get(country.slug)?.enabled ?? true}
              />
            ))}
          </tbody>
        </table>
            </div>
      </Card>

      {categories.map((category) => {
        const items = providerServices.filter((s) => s.category === category);
        return (
          <Card key={category} className="overflow-hidden">
            <div className="border-b border-border bg-background px-5 py-3">
              <h2 className="text-sm font-semibold">{category}</h2>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Service</th>
                  <th className="px-5 py-2 text-right font-medium">Base price</th>
                  <th className="px-5 py-2 text-right font-medium">Markup</th>
                  <th className="px-5 py-2 text-right font-medium">Live price</th>
                  <th className="px-5 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((service) => {
                  const setting = serviceSettingBySlug.get(service.slug);
                  const markupPercent = setting?.markupPercent ?? 0;
                  const basePriceNaira = basePriceBySlug.get(service.slug) ?? 0;

                  return (
                    <ServiceRow
                      key={service.slug}
                      slug={service.slug}
                      name={service.name}
                      color={service.color}
                      basePriceNaira={basePriceNaira}
                      enabled={setting?.enabled ?? true}
                      markupPercent={markupPercent}
                      livePriceNaira={applyMarkup(
                        basePriceNaira,
                        globalMarkupPercent + markupPercent,
                      )}
                    />
                  );
                })}
              </tbody>
            </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
