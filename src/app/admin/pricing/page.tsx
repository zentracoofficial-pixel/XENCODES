import type { Metadata } from "next";
import { Banknote, Globe2, Percent, ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin";
import { getCatalog } from "@/lib/catalog";
import { getProvider } from "@/lib/provider";
import {
  readSettings,
  readNumber,
  SETTING_KEYS,
  DEFAULT_GLOBAL_MARKUP_PERCENT,
} from "@/lib/settings";
import { formatNairaFromNaira } from "@/lib/currency";
import { StatTile } from "../stat-tile";
import { GlobalMarkupForm } from "./markup-form";

export const metadata: Metadata = { title: "Admin: Pricing" };

// Never statically prerendered. With a live provider connected, resolving
// this page makes real outbound requests, which must never run at build
// time: a slow one is exactly what timed out the Vercel build that added
// SMSPool, since this page (unlike most admin pages) had no cookies()-using
// call to already force it dynamic.
export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  await requireAdmin();

  const [catalog, settings, provider] = await Promise.all([
    getCatalog(),
    readSettings(),
    getProvider(),
  ]);
  const globalMarkupPercent = readNumber(
    settings,
    SETTING_KEYS.globalMarkupPercent,
    DEFAULT_GLOBAL_MARKUP_PERCENT,
  );

  // The provider's own quote, so the admin can see the margin on each line.
  // getCatalog() above already degrades gracefully on a provider outage;
  // this direct call does not, so it needs its own fallback rather than
  // crashing the whole page when the provider is briefly unavailable.
  const offers = await provider.listOffers().catch(() => []);
  const basePriceBySlug = new Map<string, number>();
  for (const offer of offers) {
    const current = basePriceBySlug.get(offer.serviceSlug);
    if (current === undefined || offer.priceNaira < current) {
      basePriceBySlug.set(offer.serviceSlug, offer.priceNaira);
    }
  }

  const rows = [...catalog.services].sort(
    (a, b) => a.priceFromNaira - b.priceFromNaira,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What customers actually pay right now, after markup and availability.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Starting price"
          value={formatNairaFromNaira(catalog.floorNaira)}
          icon={Banknote}
        />
        <StatTile label="Live services" value={catalog.services.length} icon={ShoppingBag} />
        <StatTile label="Live countries" value={catalog.countries.length} icon={Globe2} />
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Percent className="h-4 w-4" />
          Global markup
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Applied to every service before its own per-service markup, which is
          set on the Services page.
        </p>
        <div className="mt-4">
          <GlobalMarkupForm currentPercent={globalMarkupPercent} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Resolved prices</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cheapest live country per service, lowest first. Services and
            countries you switched off are excluded, and you manage those on the
            Services page.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing is live. Enable services and countries to see prices here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Cheapest country</th>
                <th className="px-5 py-3 text-right font-medium">Provider price</th>
                <th className="px-5 py-3 text-right font-medium">Customer pays</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((service) => {
                const base = basePriceBySlug.get(service.slug) ?? service.priceFromNaira;
                const marked = base !== service.priceFromNaira;
                return (
                  <tr
                    key={service.slug}
                    className="border-b border-border last:border-0 hover:bg-background"
                  >
                    <td className="px-5 py-3 font-medium">{service.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span aria-hidden>{service.offers[0]?.flag}</span>{" "}
                      {service.offers[0]?.countryName}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                      {formatNairaFromNaira(base)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-semibold tabular-nums ${
                        marked ? "text-forest" : ""
                      }`}
                    >
                      {formatNairaFromNaira(service.priceFromNaira)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>
        )}
      </Card>
    </div>
  );
}
