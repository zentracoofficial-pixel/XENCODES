import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { countries as baseCountries } from "@/data/countries";
import { getCatalog } from "@/lib/catalog";
import { CountryRow } from "./country-row";

export const metadata: Metadata = { title: "Admin — Countries" };

export default async function AdminCountriesPage() {
  const [countrySettings, catalog] = await Promise.all([
    prisma.countrySetting.findMany(),
    getCatalog(),
  ]);

  const settingBySlug = new Map(countrySettings.map((c) => [c.slug, c]));
  const resolvedBySlug = new Map(catalog.countries.map((c) => [c.slug, c]));
  const disabledCount = baseCountries.filter((c) => settingBySlug.get(c.slug)?.enabled === false).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Countries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {baseCountries.length} countries · {disabledCount} disabled. Disabling a country hides
          it from checkout everywhere on the site immediately.
        </p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Country</th>
              <th className="px-5 py-3 font-medium">Coverage</th>
              <th className="px-5 py-3 text-right font-medium">Live services</th>
              <th className="px-5 py-3 text-right font-medium">From</th>
              <th className="px-5 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {baseCountries.map((country) => {
              const enabled = settingBySlug.get(country.slug)?.enabled ?? true;
              const resolved = resolvedBySlug.get(country.slug);

              return (
                <CountryRow
                  key={country.slug}
                  slug={country.slug}
                  name={country.name}
                  flag={country.flag}
                  dialCode={country.dialCode}
                  availability={country.availability}
                  serviceCount={resolved?.serviceCount ?? 0}
                  priceFromNaira={resolved?.priceFromNaira ?? 0}
                  enabled={enabled}
                />
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
