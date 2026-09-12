import type { Metadata } from "next";
import { Banknote, Globe2, Percent, ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { services as baseServices } from "@/data/services";
import { getCatalog } from "@/lib/catalog";
import { readSettings, readNumber, SETTING_KEYS } from "@/lib/settings";
import { formatNairaFromNaira } from "@/lib/currency";
import { StatTile } from "../stat-tile";
import { GlobalMarkupForm } from "./markup-form";

export const metadata: Metadata = { title: "Admin — Pricing" };

export default async function AdminPricingPage() {
  const [catalog, settings] = await Promise.all([getCatalog(), readSettings()]);
  const globalMarkupPercent = readNumber(settings, SETTING_KEYS.globalMarkupPercent, 0);
  const basePriceBySlug = new Map(baseServices.map((s) => [s.slug, s.priceFromNaira]));

  const rows = [...catalog.services].sort((a, b) => a.priceFromNaira - b.priceFromNaira);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What customers actually pay right now, after markup and availability.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Starting price" value={formatNairaFromNaira(catalog.floorNaira)} icon={Banknote} />
        <StatTile label="Live services" value={catalog.services.length} icon={ShoppingBag} />
        <StatTile label="Live countries" value={catalog.countries.length} icon={Globe2} />
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Percent className="h-4 w-4" />
          Global markup
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Applied to every service before its own per-service markup, set on the Services page.
        </p>
        <div className="mt-4">
          <GlobalMarkupForm currentPercent={globalMarkupPercent} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Resolved prices</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cheapest live country per service, lowest first. Disabled services and countries are
            excluded — manage those on the Services and Countries pages.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing is live. Enable services and countries to see prices here.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 text-right font-medium">Base price</th>
                <th className="px-5 py-3 text-right font-medium">Live price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((service) => {
                const basePriceNaira = basePriceBySlug.get(service.slug) ?? service.priceFromNaira;
                const changed = basePriceNaira !== service.priceFromNaira;
                return (
                  <tr key={service.slug} className="border-b border-border last:border-0 hover:bg-secondary/40">
                    <td className="px-5 py-3 font-medium">{service.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{service.category}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                      {formatNairaFromNaira(basePriceNaira)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-semibold tabular-nums ${
                        changed ? "text-primary" : ""
                      }`}
                    >
                      {formatNairaFromNaira(service.priceFromNaira)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
