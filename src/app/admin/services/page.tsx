import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/provider";
import { applyMarkup } from "@/lib/catalog";
import { readSettings, readNumber, SETTING_KEYS } from "@/lib/settings";
import { ServiceRow } from "./service-row";
import { CountryRow } from "./country-row";

export const metadata: Metadata = { title: "Admin: Services" };

export default async function AdminServicesPage() {
  const provider = await getProvider();

  const [
    providerServices,
    providerCountries,
    providerOffers,
    serviceSettings,
    countrySettings,
    settings,
  ] = await Promise.all([
    provider.listServices(),
    provider.listCountries(),
    provider.listOffers(),
    prisma.serviceSetting.findMany(),
    prisma.countrySetting.findMany(),
    readSettings(),
  ]);

  const globalMarkupPercent = readNumber(settings, SETTING_KEYS.globalMarkupPercent, 0);
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

      {/* Countries first: switching one off affects every service. */}
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-background px-5 py-3">
          <h2 className="text-sm font-semibold">Countries</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Switching a country off hides it from checkout across the whole site.
          </p>
        </div>
        <table className="w-full text-sm">
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
      </Card>

      {categories.map((category) => {
        const items = providerServices.filter((s) => s.category === category);
        return (
          <Card key={category} className="overflow-hidden">
            <div className="border-b border-border bg-background px-5 py-3">
              <h2 className="text-sm font-semibold">{category}</h2>
            </div>
            <table className="w-full text-sm">
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
          </Card>
        );
      })}
    </div>
  );
}
