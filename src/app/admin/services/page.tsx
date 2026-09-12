import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { services as baseServices, serviceCategories } from "@/data/services";
import { readSettings, readNumber, SETTING_KEYS } from "@/lib/settings";
import { applyMarkup } from "@/lib/catalog";
import { ServiceRow } from "./service-row";

export const metadata: Metadata = { title: "Admin — Services" };

export default async function AdminServicesPage() {
  const [serviceSettings, settings] = await Promise.all([
    prisma.serviceSetting.findMany(),
    readSettings(),
  ]);

  const globalMarkupPercent = readNumber(settings, SETTING_KEYS.globalMarkupPercent, 0);
  const settingBySlug = new Map(serviceSettings.map((s) => [s.slug, s]));
  const disabledCount = baseServices.filter((s) => settingBySlug.get(s.slug)?.enabled === false).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {baseServices.length} services · {disabledCount} disabled · global markup is{" "}
          {globalMarkupPercent}% (set on the Pricing page). Per-service markup stacks on top.
        </p>
      </div>

      {serviceCategories.map((category) => {
        const items = baseServices.filter((s) => s.category === category);
        return (
          <Card key={category} className="overflow-hidden">
            <div className="border-b border-border bg-secondary/60 px-5 py-3">
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
                  const setting = settingBySlug.get(service.slug);
                  const enabled = setting?.enabled ?? true;
                  const markupPercent = setting?.markupPercent ?? 0;
                  const totalMarkup = globalMarkupPercent + markupPercent;
                  const livePriceNaira = applyMarkup(service.priceFromNaira, totalMarkup);

                  return (
                    <ServiceRow
                      key={service.slug}
                      service={{
                        slug: service.slug,
                        name: service.name,
                        color: service.color,
                        colorDark: service.colorDark,
                      }}
                      basePriceNaira={service.priceFromNaira}
                      enabled={enabled}
                      markupPercent={markupPercent}
                      livePriceNaira={livePriceNaira}
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
