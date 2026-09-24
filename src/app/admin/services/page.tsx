import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getEnabledProviders, getNumberProvider, PROVIDER_UNAVAILABLE_COPY } from "@/lib/provider";
import { loadMarginRules, resolveMargin, quotePrice } from "@/lib/pricing";
import { brandIcons } from "@/data/brand-icons";
import { formatNaira } from "@/lib/currency";
import { ServiceRow } from "./service-row";

export const metadata: Metadata = { title: "Admin: Services" };

// Resolving this page makes real outbound requests once a provider is
// connected, which must never run at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 150;
const FALLBACK_COLOR = "#63756F";

/** A worked example, so the margin rules are legible without arithmetic. */
const EXAMPLE_COST_KOBO = 100_000; // 1,000 Naira

/**
 * Services and their pricing in one place.
 *
 * A service's margin is a property of the service, so it is configured
 * here rather than on a separate pricing screen. The platform defaults
 * that everything falls back to live in Settings, with the rest of the
 * business configuration.
 */
export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();

  const { q } = await searchParams;
  const query = q?.trim().toLowerCase();

  const [resolved, enabledProviders, rules, settings] = await Promise.all([
    getNumberProvider(),
    getEnabledProviders(),
    loadMarginRules(),
    prisma.serviceSetting.findMany(),
  ]);

  const settingBySlug = new Map(settings.map((row) => [row.slug, row]));

  // Merged across every enabled provider: a service is listed the moment
  // any one of them offers it, and the cheapest cost anywhere wins, the
  // same rule quotePair() applies live at purchase time. providerServiceId
  // is qualified by provider id once more than one provider reports the
  // same slug, so an admin reconciling against a specific supplier's own
  // dashboard can tell which id belongs to which.
  const known = new Map<
    string,
    {
      slug: string;
      name: string;
      color: string;
      category: string;
      providerServiceId: string | null;
      cheapestCostKobo: number | null;
    }
  >();
  let syncedAt: Date | null = null;

  for (const { id, provider } of enabledProviders) {
    const [services, cheapestCostByService] = await Promise.all([
      provider.getServices().catch(() => []),
      provider.getCheapestCostByService?.().catch(() => new Map<string, number>()) ??
        Promise.resolve(new Map<string, number>()),
    ]);
    const providerSyncedAt = provider.getCatalogSyncedAt?.() ?? null;
    if (providerSyncedAt && (!syncedAt || providerSyncedAt > syncedAt)) syncedAt = providerSyncedAt;

    for (const service of services) {
      const cost = cheapestCostByService.get(service.slug) ?? null;
      const idLabel = service.providerServiceId
        ? enabledProviders.length > 1
          ? `${id}:${service.providerServiceId}`
          : service.providerServiceId
        : null;

      const existing = known.get(service.slug);
      if (!existing) {
        known.set(service.slug, {
          slug: service.slug,
          name: service.name,
          // The same brand-colour rule as everywhere else a service
          // appears: a real logo's own colour when one exists, the
          // adapter's neutral default otherwise.
          color: brandIcons[service.slug]?.hex ?? service.color,
          category: service.category,
          providerServiceId: idLabel,
          cheapestCostKobo: cost,
        });
      } else {
        if (idLabel && !existing.providerServiceId?.includes(idLabel)) {
          existing.providerServiceId = existing.providerServiceId
            ? `${existing.providerServiceId}, ${idLabel}`
            : idLabel;
        }
        if (cost !== null && (existing.cheapestCostKobo === null || cost < existing.cheapestCostKobo)) {
          existing.cheapestCostKobo = cost;
        }
      }
    }
  }

  // Any service an admin has already configured stays listed even with no
  // provider connected, so overrides remain visible and editable rather
  // than disappearing along with the supplier that prompted them.
  for (const row of settings) {
    if (known.has(row.slug)) continue;
    known.set(row.slug, {
      slug: row.slug,
      name: row.slug,
      color: brandIcons[row.slug]?.hex ?? FALLBACK_COLOR,
      category: "Configured, not currently offered",
      providerServiceId: null,
      cheapestCostKobo: null,
    });
  }

  const services = Array.from(known.values())
    .filter(
      (service) =>
        !query ||
        service.name.toLowerCase().includes(query) ||
        service.slug.includes(query),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const exclusiveExample = quotePrice(
    EXAMPLE_COST_KOBO,
    rules.exclusivePercent,
  );
  const defaultExample = quotePrice(EXAMPLE_COST_KOBO, rules.defaultPercent);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What Xencodes sells, and the margin each one earns.
          {enabledProviders.length > 0
            ? ` Synchronized from ${enabledProviders.map((p) => p.label).join(", ")}`
            : ""}
          {syncedAt
            ? `, last refreshed ${syncedAt.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}.`
            : enabledProviders.length > 0
              ? "."
              : ""}
        </p>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Pricing rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gross margin, as a share of what the customer pays. Not markup: at{" "}
          {rules.defaultPercent}% the customer pays{" "}
          {formatNaira(defaultExample.customerPriceKobo)} for a number that
          costs {formatNaira(EXAMPLE_COST_KOBO)}, and{" "}
          {formatNaira(defaultExample.grossProfitKobo)} of that is profit.
        </p>
        <dl className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg border border-border px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Standard margin
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {rules.defaultPercent}%
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatNaira(EXAMPLE_COST_KOBO)} cost sells for{" "}
              {formatNaira(defaultExample.customerPriceKobo)}
            </p>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Exclusive tier
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {rules.exclusivePercent}%
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatNaira(EXAMPLE_COST_KOBO)} cost sells for{" "}
              {formatNaira(exclusiveExample.customerPriceKobo)}
            </p>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Both defaults are set in{" "}
          <Link href="/admin/settings" className="text-forest hover:underline">
            Settings
          </Link>
          . A margin typed against a service below overrides them for that
          service only.
        </p>
      </Card>

      {resolved.connected ? null : (
        <p className="rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
          {PROVIDER_UNAVAILABLE_COPY[resolved.reason]} The live catalog is
          empty until one is, so only services you have already configured are
          listed. Margins set here apply as soon as numbers are back on sale.
        </p>
      )}

      <form className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search services"
          className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
        />
      </form>

      <Card className="overflow-hidden">
        {services.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {resolved.connected
              ? "No service matches that search."
              : "No services to configure yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Service</th>
                  <th className="px-3 py-2.5 font-medium">Provider ID</th>
                  <th className="px-3 py-2.5 text-right font-medium">Provider cost</th>
                  <th className="px-3 py-2.5 text-right font-medium">Customer price</th>
                  <th className="px-3 py-2.5 font-medium">Pricing rule</th>
                  <th className="px-3 py-2.5 text-right font-medium">Margin</th>
                  <th className="px-3 py-2.5 text-right font-medium">Override</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {services.slice(0, PAGE_SIZE).map((service) => {
                  const setting = settingBySlug.get(service.slug);
                  const resolvedRule = resolveMargin(rules, service.slug);
                  const quote = service.cheapestCostKobo
                    ? quotePrice(service.cheapestCostKobo, resolvedRule.percent)
                    : null;
                  return (
                    <ServiceRow
                      key={service.slug}
                      slug={service.slug}
                      name={service.name}
                      color={service.color}
                      category={service.category}
                      providerServiceId={service.providerServiceId}
                      cheapestCostKobo={service.cheapestCostKobo}
                      cheapestCustomerPriceKobo={quote?.customerPriceKobo ?? null}
                      enabled={setting?.enabled ?? true}
                      overridePercent={setting?.grossMarginPercent ?? null}
                      effectivePercent={resolvedRule.percent}
                      ruleLabel={resolvedRule.ruleLabel}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {services.length > PAGE_SIZE ? (
        <p className="text-xs text-muted-foreground">
          Showing {PAGE_SIZE} of {services.length.toLocaleString("en-NG")}{" "}
          services. Search to reach the rest.
        </p>
      ) : null}
    </div>
  );
}
