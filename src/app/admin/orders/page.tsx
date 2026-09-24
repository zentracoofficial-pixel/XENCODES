import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira, formatPhoneNumber } from "@/lib/currency";
import { realisedMargin } from "@/lib/pricing";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import type { ActivationStatus, Prisma } from "@/generated/prisma/client";
import {
  ACTIVATION_STATUS_VARIANT,
  ORDER_STATUS_LABEL,
} from "@/lib/activation-status";

export const metadata: Metadata = { title: "Admin: Orders" };

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const STATUS_FILTERS: { label: string; value: ActivationStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "WAITING" },
  { label: "Completed", value: "RECEIVED" },
  { label: "Failed", value: "EXPIRED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Refunded", value: "REFUNDED" },
];

const SORTS = {
  newest: { label: "Newest", orderBy: { createdAt: "desc" } },
  oldest: { label: "Oldest", orderBy: { createdAt: "asc" } },
  price: { label: "Highest price", orderBy: { priceKobo: "desc" } },
  profit: { label: "Highest profit", orderBy: { grossProfitKobo: "desc" } },
} satisfies Record<
  string,
  { label: string; orderBy: Prisma.ActivationOrderByWithRelationInput }
>;

type SortKey = keyof typeof SORTS;

/**
 * Every order in one place, rather than a page per status.
 *
 * Refunds are a filter here, not a separate screen: a refund is something
 * that happened to an order, and looking at it next to the order's cost
 * and price is the only way to see what it actually did to the margin.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    sort?: string;
    service?: string;
    country?: string;
    provider?: string;
    from?: string;
    to?: string;
    includeDeleted?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();

  const { status, q, sort, service, country, provider, from, to, includeDeleted, page: pageRaw } =
    await searchParams;
  const activeFilter =
    STATUS_FILTERS.find((f) => f.value === status)?.value ?? "ALL";
  const activeSort: SortKey = sort && sort in SORTS ? (sort as SortKey) : "newest";
  const query = q?.trim();
  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59.999`) : null;
  const showDeleted = includeDeleted === "1";
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);

  // Distinct facet values are read from the orders that actually exist,
  // not from the live provider catalog: a filter should only ever offer a
  // value that can actually return a result.
  const [serviceFacets, countryFacets, providerFacets] = await Promise.all([
    prisma.activation.findMany({
      distinct: ["serviceSlug"],
      select: { serviceSlug: true, serviceName: true },
      orderBy: { serviceName: "asc" },
    }),
    prisma.activation.findMany({
      distinct: ["countrySlug"],
      select: { countrySlug: true, countryName: true },
      orderBy: { countryName: "asc" },
    }),
    prisma.activation.findMany({
      distinct: ["provider"],
      select: { provider: true },
      orderBy: { provider: "asc" },
    }),
  ]);

  const where: Prisma.ActivationWhereInput = {
    ...(activeFilter === "ALL" ? {} : { status: activeFilter }),
    ...(service ? { serviceSlug: service } : {}),
    ...(country ? { countrySlug: country } : {}),
    ...(provider ? { provider } : {}),
    // A deleted account's own past orders are kept for financial records
    // (see deleteUserAction in admin/users/actions.ts), but that is not the
    // same as wanting them cluttering ordinary browsing here. Hidden by
    // default; the toggle below still reaches them when needed.
    ...(showDeleted ? {} : { user: { deletedAt: null } }),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            { id: query },
            { providerOrderId: query },
            { phoneNumber: { contains: query, mode: "insensitive" } },
            { serviceName: { contains: query, mode: "insensitive" } },
            { countryName: { contains: query, mode: "insensitive" } },
            { user: { email: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.activation.findMany({
      where,
      orderBy: SORTS[activeSort].orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true } } },
    }),
    prisma.activation.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const keep = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      status: activeFilter === "ALL" ? undefined : activeFilter,
      q: query,
      sort: activeSort === "newest" ? undefined : activeSort,
      service,
      country,
      provider,
      from,
      to,
      includeDeleted: showDeleted ? "1" : undefined,
      // Deliberately not carried forward by default: changing any filter
      // or sort is a new result set, so it should land on page 1, not
      // whatever page happened to be open before. Only the actual
      // Previous/Next links below pass page explicitly via extra.
      ...extra,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const search = params.toString();
    return search ? `/admin/orders?${search}` : "/admin/orders";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total.toLocaleString("en-NG")} matching
          {totalPages > 1 ? `, page ${page} of ${totalPages}` : ""}.
        </p>
      </div>

      <form className="space-y-3">
        {/* Filters ride along so searching does not silently reset them. */}
        {activeFilter === "ALL" ? null : (
          <input type="hidden" name="status" value={activeFilter} />
        )}
        {activeSort === "newest" ? null : (
          <input type="hidden" name="sort" value={activeSort} />
        )}
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search email, number, service, country or order id"
            className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            name="service"
            defaultValue={service ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
          >
            <option value="">All services</option>
            {serviceFacets.map((row) => (
              <option key={row.serviceSlug} value={row.serviceSlug}>
                {row.serviceName}
              </option>
            ))}
          </select>
          <select
            name="country"
            defaultValue={country ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
          >
            <option value="">All countries</option>
            {countryFacets.map((row) => (
              <option key={row.countrySlug} value={row.countrySlug}>
                {row.countryName}
              </option>
            ))}
          </select>
          <select
            name="provider"
            defaultValue={provider ?? ""}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
          >
            <option value="">All providers</option>
            {providerFacets.map((row) => (
              <option key={row.provider} value={row.provider}>
                {row.provider}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            From
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              className="h-10 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            To
            <input
              type="date"
              name="to"
              defaultValue={to ?? ""}
              className="h-10 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-lg border border-border px-3.5 text-sm font-medium transition-colors hover:border-mint hover:bg-mint-soft"
          >
            Apply
          </button>
          {service || country || provider || from || to ? (
            <Link
              href={keep({ service: undefined, country: undefined, provider: undefined, from: undefined, to: undefined })}
              className="text-xs text-muted-foreground hover:text-forest hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={keep({ status: filter.value === "ALL" ? undefined : filter.value })}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium transition-colors",
              activeFilter === filter.value
                ? "border-forest bg-primary text-white"
                : "border-border text-muted-foreground hover:bg-mint-soft",
            )}
          >
            {filter.label}
          </Link>
        ))}

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sort</span>
          {(Object.keys(SORTS) as SortKey[]).map((key) => (
            <Link
              key={key}
              href={keep({ sort: key === "newest" ? undefined : key })}
              className={cn(
                "inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-medium transition-colors",
                activeSort === key
                  ? "bg-mint-soft text-forest"
                  : "text-muted-foreground hover:bg-mint-soft",
              )}
            >
              {SORTS[key].label}
            </Link>
          ))}
        </span>
      </div>

      <Link
        href={keep({ includeDeleted: showDeleted ? undefined : "1" })}
        className="inline-block text-xs text-muted-foreground hover:text-forest hover:underline"
      >
        {showDeleted ? "Hide deleted accounts" : "Show deleted accounts"}
      </Link>

      <Card className="overflow-hidden">
        {orders.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No orders match this search.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Order</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 text-right font-medium">Price</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-3 py-2.5 text-right font-medium">Profit</th>
                  <th className="px-3 py-2.5 text-right font-medium">Margin</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const priced = order.providerCostKobo > 0;
                  const margin = realisedMargin(
                    order.priceKobo,
                    order.providerCostKobo,
                  );
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-border last:border-0 hover:bg-background"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="flex items-center gap-3"
                        >
                          <ActivationLogo
                            serviceSlug={order.serviceSlug}
                            serviceName={order.serviceName}
                            size="sm"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:text-forest">
                              {order.serviceName}
                            </span>
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {formatPhoneNumber(order.phoneNumber)}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/users/${order.userId}`}
                          className="block max-w-[14rem] truncate text-xs text-muted-foreground hover:text-forest hover:underline"
                        >
                          {order.user.email}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {order.countryName}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">
                        {formatNaira(order.priceKobo)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                        {priced ? formatNaira(order.providerCostKobo) : "n/a"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right tabular-nums",
                          priced && order.grossProfitKobo > 0
                            ? "text-success"
                            : "text-muted-foreground",
                        )}
                      >
                        {priced ? formatNaira(order.grossProfitKobo) : "n/a"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                        {priced ? `${margin}%` : "n/a"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={ACTIVATION_STATUS_VARIANT[order.status]}>
                          {ORDER_STATUS_LABEL[order.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                        {order.createdAt.toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Link
            href={keep({ page: page > 1 ? String(page - 1) : undefined })}
            aria-disabled={page <= 1}
            className={cn(
              "inline-flex min-h-9 items-center rounded-lg border border-border px-3.5 text-sm font-medium transition-colors",
              page <= 1
                ? "pointer-events-none opacity-40"
                : "hover:border-mint hover:bg-mint-soft",
            )}
          >
            Previous
          </Link>
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <Link
            href={keep({ page: String(page + 1) })}
            aria-disabled={page >= totalPages}
            className={cn(
              "inline-flex min-h-9 items-center rounded-lg border border-border px-3.5 text-sm font-medium transition-colors",
              page >= totalPages
                ? "pointer-events-none opacity-40"
                : "hover:border-mint hover:bg-mint-soft",
            )}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  );
}
