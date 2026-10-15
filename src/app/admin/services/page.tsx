import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Calculator, Search, Settings2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { GENERIC_SERVICE_COLOR } from "@/lib/brand-match";
import { getEnabledProviders, getNumberProvider, PROVIDER_UNAVAILABLE_COPY } from "@/lib/provider";
import { loadMarginRules, resolveMultiplier, quoteForCurrency, quotePrice } from "@/lib/pricing";
import { formatMultiplier, multiplierToMarginPercent } from "@/lib/price-multiplier";
import { brandIcons } from "@/data/brand-icons";
import { formatMoney } from "@/lib/currency";
import { getDefaultCurrency, convertUsdCentsToCurrencyMinor } from "@/lib/currency-config";
import { ServiceRow, SERVICE_GRID } from "./service-row";
import { BlockedServicesCard } from "./blocked-services-card";
import { Metric, MetricGrid } from "../metric";

export const metadata: Metadata = { title: "Admin: Services" };

// Resolving this page makes real outbound requests once a provider is
// connected, which must never run at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
const SALES_WINDOW_DAYS = 30;

const FILTERS = {
  all: "All",
  live: "On sale",
  off: "Switched off",
  custom: "Own price",
  exclusive: "Exclusive tier",
  unpriced: "No live price",
} as const;
type FilterKey = keyof typeof FILTERS;

const SORTS = {
  name: "Name, A to Z",
  sold: "Most sold, 30 days",
  costDesc: "Highest provider cost",
  costAsc: "Lowest provider cost",
} as const;
type SortKey = keyof typeof SORTS;
const FALLBACK_COLOR = GENERIC_SERVICE_COLOR;

/** A worked example, so the margin rules are legible without arithmetic. In
 *  USD cents, like every supplier cost, then converted into the platform's
 *  default currency the same way a real offer would be. */
const EXAMPLE_COST_USD_CENTS = 100; // $1.00

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
  searchParams: Promise<{ q?: string; filter?: string; sort?: string; page?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const q = params.q;
  const query = q?.trim().toLowerCase();
  const filter: FilterKey = params.filter && params.filter in FILTERS ? (params.filter as FilterKey) : "all";
  const sort: SortKey = params.sort && params.sort in SORTS ? (params.sort as SortKey) : "name";

  const salesSince = daysAgo(SALES_WINDOW_DAYS);

  const [resolved, enabledProviders, rules, settings, defaultCurrency, soldRows] = await Promise.all([
    getNumberProvider(),
    getEnabledProviders(),
    loadMarginRules(),
    prisma.serviceSetting.findMany(),
    getDefaultCurrency(),
    // Orders that delivered a code, per service: what actually sells.
    prisma.activation.groupBy({
      by: ["serviceSlug"],
      where: { status: "RECEIVED", createdAt: { gte: salesSince } },
      _count: { _all: true },
    }),
  ]);

  const settingBySlug = new Map(settings.map((row) => [row.slug, row]));
  const soldBySlug = new Map(soldRows.map((row) => [row.serviceSlug, row._count._all]));

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
      cheapestCostUsdCents: number | null;
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
          cheapestCostUsdCents: cost,
        });
      } else {
        if (idLabel && !existing.providerServiceId?.includes(idLabel)) {
          existing.providerServiceId = existing.providerServiceId
            ? `${existing.providerServiceId}, ${idLabel}`
            : idLabel;
        }
        if (
          cost !== null &&
          (existing.cheapestCostUsdCents === null || cost < existing.cheapestCostUsdCents)
        ) {
          existing.cheapestCostUsdCents = cost;
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
      cheapestCostUsdCents: null,
    });
  }

  // Everything each row needs, worked out once so the counts, the filters
  // and the rows all agree.
  const all = Array.from(known.values()).map((service) => {
    const setting = settingBySlug.get(service.slug);
    const resolvedRule = resolveMultiplier(rules, service.slug);
    // Shown in the platform's default currency: illustrative only, since
    // the country picked at purchase decides the real price in the buyer's
    // own currency.
    const quote = service.cheapestCostUsdCents
      ? quoteForCurrency(rules, service.cheapestCostUsdCents, service.slug, defaultCurrency)
      : null;
    return {
      ...service,
      enabled: setting?.enabled ?? true,
      overrideMultiplier: rules.serviceOverrides.get(service.slug) ?? null,
      effectiveMultiplier: resolvedRule.multiplier,
      ruleLabel: resolvedRule.ruleLabel,
      rule: resolvedRule.rule,
      costMinor: quote?.providerCostKobo ?? null,
      priceMinor: quote?.customerPriceKobo ?? null,
      sold: soldBySlug.get(service.slug) ?? 0,
    };
  });

  const matchesFilter: Record<FilterKey, (row: (typeof all)[number]) => boolean> = {
    all: () => true,
    live: (row) => row.enabled,
    off: (row) => !row.enabled,
    custom: (row) => row.overrideMultiplier !== null,
    exclusive: (row) => row.rule === "exclusive",
    unpriced: (row) => row.costMinor === null,
  };

  const searched = all.filter(
    (service) => !query || service.name.toLowerCase().includes(query) || service.slug.includes(query),
  );
  const filterCounts = Object.fromEntries(
    (Object.keys(FILTERS) as FilterKey[]).map((key) => [key, searched.filter(matchesFilter[key]).length]),
  ) as Record<FilterKey, number>;

  const byName = (a: (typeof all)[number], b: (typeof all)[number]) => a.name.localeCompare(b.name);
  const services = searched.filter(matchesFilter[filter]).sort((a, b) => {
    if (sort === "sold") return b.sold - a.sold || byName(a, b);
    if (sort === "costDesc" || sort === "costAsc") {
      // Unpriced services always sink to the bottom, whichever way.
      if (a.costMinor === null || b.costMinor === null) {
        return (a.costMinor === null ? 1 : 0) - (b.costMinor === null ? 1 : 0) || byName(a, b);
      }
      return (sort === "costDesc" ? b.costMinor - a.costMinor : a.costMinor - b.costMinor) || byName(a, b);
    }
    return byName(a, b);
  });

  const totalPages = Math.max(1, Math.ceil(services.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const pageRows = services.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const blocked = enabledProviders.flatMap(({ provider }) => provider.getBlockedServices?.() ?? []);
  const onSale = all.filter((row) => row.enabled).length;
  const switchedOff = all.length - onSale;
  const ownPrice = all.filter((row) => row.overrideMultiplier !== null).length;
  const soldTotal = all.reduce((sum, row) => sum + row.sold, 0);
  const sellingServices = all.filter((row) => row.sold > 0).length;

  const exampleCostMinor = convertUsdCentsToCurrencyMinor(EXAMPLE_COST_USD_CENTS, defaultCurrency);
  const exclusiveExample = quotePrice(exampleCostMinor, rules.exclusiveMultiplier);
  const defaultExample = quotePrice(exampleCostMinor, rules.defaultMultiplier);

  /** A link to this page with some of the current choices changed. */
  const hrefWith = (changes: Partial<Record<"q" | "filter" | "sort" | "page", string | null>>) => {
    const next = new URLSearchParams();
    const merged = { q: q?.trim() || null, filter: filter === "all" ? null : filter, sort: sort === "name" ? null : sort, page: null, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const qs = next.toString();
    return qs ? `/admin/services?${qs}` : "/admin/services";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest/70">Admin console</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What Xencodes sells, what the provider charges for it and what customers pay.
          </p>
        </div>
        {enabledProviders.length > 0 ? (
          <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", resolved.connected ? "bg-success" : "bg-warning")} />
            <span>
              <span className="font-medium text-foreground">{enabledProviders.map((p) => p.label).join(", ")}</span>
              {syncedAt
                ? ` · refreshed ${syncedAt.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}`
                : ""}
            </span>
          </p>
        ) : null}
      </div>

      {resolved.connected ? null : (
        <p className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          {PROVIDER_UNAVAILABLE_COPY[resolved.reason]} The live catalog is
          empty until one is, so only services you have already configured are
          listed. Prices set here apply as soon as numbers are back on sale.
        </p>
      )}

      <MetricGrid>
        <Metric
          label="On sale"
          value={onSale.toLocaleString("en-NG")}
          hint={`of ${all.length.toLocaleString("en-NG")} services listed`}
          href={hrefWith({ filter: "live" })}
          tone="success"
        />
        <Metric
          label="Switched off"
          value={switchedOff.toLocaleString("en-NG")}
          hint="Hidden from customers by an admin"
          href={hrefWith({ filter: "off" })}
          tone={switchedOff > 0 ? "warning" : "default"}
        />
        <Metric
          label="Own price"
          value={ownPrice.toLocaleString("en-NG")}
          hint="Services priced apart from the defaults"
          href={hrefWith({ filter: "custom" })}
        />
        <Metric
          label={`Sold, ${SALES_WINDOW_DAYS} days`}
          value={soldTotal.toLocaleString("en-NG")}
          hint={`Codes delivered, across ${sellingServices.toLocaleString("en-NG")} ${sellingServices === 1 ? "service" : "services"}`}
          href={hrefWith({ sort: "sold", filter: null })}
        />
      </MetricGrid>

      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
          <PriceTier
            label="Standard price"
            multiplier={rules.defaultMultiplier}
            cost={formatMoney(exampleCostMinor, defaultCurrency.code)}
            price={formatMoney(defaultExample.customerPriceKobo, defaultCurrency.code)}
            profit={formatMoney(defaultExample.grossProfitKobo, defaultCurrency.code)}
          />
          <PriceTier
            label="Exclusive tier"
            multiplier={rules.exclusiveMultiplier}
            cost={formatMoney(exampleCostMinor, defaultCurrency.code)}
            price={formatMoney(exclusiveExample.customerPriceKobo, defaultCurrency.code)}
            profit={formatMoney(exclusiveExample.grossProfitKobo, defaultCurrency.code)}
            className="border-t border-border md:border-l md:border-t-0"
          />
          <div className="flex flex-col justify-between gap-3 border-t border-border bg-background/60 p-5 md:border-l md:border-t-0">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-soft text-forest">
                <Calculator className="h-[18px] w-[18px]" />
              </span>
              <p className="text-sm text-muted-foreground">
                Customers pay the provider&apos;s cost times a multiple. A price set on a service below
                overrides both defaults for that service only.
              </p>
            </div>
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-forest hover:underline"
            >
              <Settings2 className="h-4 w-4" />
              Change the defaults in Settings
            </Link>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {filter === "all" ? null : <input type="hidden" name="filter" value={filter} />}
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search services by name"
              className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
          </div>
          <div className="flex gap-2">
            <select
              name="sort"
              defaultValue={sort}
              aria-label="Sort services"
              className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25 sm:flex-none"
            >
              {(Object.keys(SORTS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORTS[key]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-11 shrink-0 rounded-lg bg-forest px-4 text-sm font-medium text-white transition-colors hover:bg-forest-dark"
            >
              Apply
            </button>
          </div>
        </form>

        <nav aria-label="Filter services" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
            {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
              <li key={key}>
                <Link
                  href={hrefWith({ filter: key === "all" ? null : key })}
                  aria-current={filter === key ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors",
                    filter === key
                      ? "border-forest bg-forest text-white"
                      : "border-border bg-surface text-muted-foreground hover:border-mint hover:text-foreground",
                  )}
                >
                  {FILTERS[key]}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      filter === key ? "bg-white/15" : "bg-background",
                    )}
                  >
                    {filterCounts[key].toLocaleString("en-NG")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold">
            {services.length.toLocaleString("en-NG")} {services.length === 1 ? "service" : "services"}
            {query ? <span className="font-normal text-muted-foreground"> matching &ldquo;{q?.trim()}&rdquo;</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Prices shown in {defaultCurrency.code}, from the cheapest country on offer
          </p>
        </div>

        {services.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {all.length === 0
              ? resolved.connected
                ? "The provider has not listed any services yet."
                : "No services to configure yet."
              : "No service matches this search or filter."}
          </p>
        ) : (
          <>
            <div
              aria-hidden
              className={cn(
                "hidden border-b border-border bg-background px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
                SERVICE_GRID,
              )}
            >
              <span>Service and status</span>
              <span>Provider cost</span>
              <span>Customer price</span>
              <span>Pricing</span>
              <span>Sold, 30d</span>
              <span className="text-right">Actions</span>
            </div>
            <ul>
              {pageRows.map((service) => (
                <ServiceRow
                  key={service.slug}
                  slug={service.slug}
                  name={service.name}
                  color={service.color}
                  category={service.category}
                  providerServiceId={service.providerServiceId}
                  currency={defaultCurrency.code}
                  cheapestCostKobo={service.costMinor}
                  cheapestCustomerPriceKobo={service.priceMinor}
                  enabled={service.enabled}
                  overrideMultiplier={service.overrideMultiplier}
                  effectiveMultiplier={service.effectiveMultiplier}
                  ruleLabel={service.ruleLabel}
                  completed30d={service.sold}
                />
              ))}
            </ul>
          </>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:px-5">
            <p className="text-muted-foreground">
              {((page - 1) * PAGE_SIZE + 1).toLocaleString("en-NG")}–
              {Math.min(page * PAGE_SIZE, services.length).toLocaleString("en-NG")} of{" "}
              {services.length.toLocaleString("en-NG")}
            </p>
            <div className="flex gap-2">
              <PageLink href={page > 1 ? hrefWith({ page: String(page - 1) }) : null} label="Previous">
                <ArrowLeft className="h-4 w-4" />
              </PageLink>
              <PageLink href={page < totalPages ? hrefWith({ page: String(page + 1) }) : null} label="Next">
                <ArrowRight className="h-4 w-4" />
              </PageLink>
            </div>
          </div>
        ) : null}
      </Card>

      <div id="restricted">
        <BlockedServicesCard blocked={blocked} />
      </div>
    </div>
  );
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function PriceTier({
  label,
  multiplier,
  cost,
  price,
  profit,
  className,
}: {
  label: string;
  multiplier: number;
  cost: string;
  price: string;
  profit: string;
  className?: string;
}) {
  return (
    <div className={cn("p-5", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatMultiplier(multiplier)}</span>
        <span className="text-sm text-muted-foreground">{multiplierToMarginPercent(multiplier)}% margin</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {cost} cost sells for <span className="font-medium text-foreground">{price}</span>, {profit} profit
      </p>
    </div>
  );
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const className = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium";
  if (!href) {
    return (
      <span aria-disabled className={cn(className, "cursor-not-allowed text-muted-foreground/50")}>
        {label === "Previous" ? children : null}
        {label}
        {label === "Next" ? children : null}
      </span>
    );
  }
  return (
    <Link href={href} className={cn(className, "bg-surface transition-colors hover:border-mint hover:bg-mint-soft")}>
      {label === "Previous" ? children : null}
      {label}
      {label === "Next" ? children : null}
    </Link>
  );
}
