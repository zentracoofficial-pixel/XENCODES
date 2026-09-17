import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira, formatPhoneNumber } from "@/lib/currency";
import { getNumberProvider, PROVIDER_UNAVAILABLE_COPY } from "@/lib/provider";
import { realisedMargin } from "@/lib/pricing";
import {
  ACTIVATION_STATUS_VARIANT,
  ORDER_STATUS_LABEL,
} from "@/lib/activation-status";
import { Metric, MetricGrid } from "./metric";

export const metadata: Metadata = { title: "Admin: Dashboard" };

// Never statically prerendered: this reads the database and, once a live
// provider is connected, makes real outbound requests, neither of which
// should run at build time.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const [
    totalUsers,
    totalOrders,
    todayOrders,
    pendingOrders,
    completedOrders,
    failedOrders,
    openSupport,
    fundingAgg,
    salesAgg,
    deliveredAgg,
    balancesAgg,
    recentOrders,
    recentTransactions,
    recentFailures,
    resolved,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.activation.count(),
    prisma.activation.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.activation.count({ where: { status: "WAITING" } }),
    prisma.activation.count({ where: { status: "RECEIVED" } }),
    prisma.activation.count({
      where: { status: { in: ["EXPIRED", "CANCELLED", "REFUNDED"] } },
    }),
    prisma.activation.count({
      where: {
        status: { in: ["EXPIRED", "CANCELLED", "REFUNDED"] },
        createdAt: { gte: startOfWeek },
      },
    }),
    // Money customers actually paid in. Pending top ups are money asked
    // for, not received, so they are not counted here.
    prisma.walletTransaction.aggregate({
      where: { type: "TOPUP", status: "SUCCESSFUL" },
      _sum: { amountKobo: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "PURCHASE", status: "SUCCESSFUL" },
      _sum: { amountKobo: true },
    }),
    // Margin is measured over orders that stood. A refunded order returns
    // the customer's money, so counting its profit as earned would
    // overstate what the business kept.
    prisma.activation.aggregate({
      where: { status: "RECEIVED" },
      _sum: { priceKobo: true, providerCostKobo: true, grossProfitKobo: true },
    }),
    prisma.user.aggregate({ _sum: { walletBalanceKobo: true } }),
    prisma.activation.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { email: true } } },
    }),
    prisma.walletTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { email: true } } },
    }),
    prisma.activation.findMany({
      where: { status: { in: ["EXPIRED", "CANCELLED", "REFUNDED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { email: true } } },
    }),
    getNumberProvider(),
  ]);

  const fundingKobo = fundingAgg._sum.amountKobo ?? 0;
  const salesKobo = Math.abs(salesAgg._sum.amountKobo ?? 0);
  const providerCostKobo = deliveredAgg._sum.providerCostKobo ?? 0;
  const grossProfitKobo = deliveredAgg._sum.grossProfitKobo ?? 0;
  const deliveredSalesKobo = deliveredAgg._sum.priceKobo ?? 0;
  const marginPercent = realisedMargin(deliveredSalesKobo, providerCostKobo);
  const customerBalancesKobo = balancesAgg._sum.walletBalanceKobo ?? 0;

  // Only asked for when a provider is connected and actually reports it.
  // Three distinct answers, because "no provider", "this one does not tell
  // us" and "it told us and the number is low" call for different actions.
  const providerBalanceKobo = resolved.connected
    ? await resolved.provider.getProviderBalanceKobo?.().catch(() => null) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What is happening across Xencodes right now.
        </p>
      </div>

      {/* The one thing that stops every sale, so it sits above everything
          that counts sales. */}
      {resolved.connected ? null : (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-warning/40 bg-warning-soft p-5">
          <div className="flex items-start gap-3">
            <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold text-warning">No number provider connected</p>
              <p className="mt-0.5 text-sm text-warning">
                {PROVIDER_UNAVAILABLE_COPY[resolved.reason]} Customers cannot
                buy numbers until one is connected, and nothing is being
                charged to them.
              </p>
            </div>
          </div>
          <Link
            href="/admin/settings"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-warning/40 bg-surface px-3.5 text-sm font-medium text-warning transition-colors hover:bg-white"
          >
            Provider settings
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      )}

      <section>
        <h2 className="mb-2.5 text-sm font-semibold">Operations</h2>
        <MetricGrid>
          <Metric label="Total users" value={totalUsers} href="/admin/users" />
          <Metric label="Total orders" value={totalOrders} href="/admin/orders" />
          <Metric
            label="Orders today"
            value={todayOrders}
            href="/admin/orders"
          />
          <Metric
            label="Pending"
            value={pendingOrders}
            hint="Waiting on a code"
            href="/admin/orders?status=WAITING"
            tone={pendingOrders > 0 ? "warning" : "default"}
          />
          <Metric
            label="Completed"
            value={completedOrders}
            href="/admin/orders?status=RECEIVED"
            tone="success"
          />
          <Metric
            label="Failed"
            value={failedOrders}
            hint="Expired, cancelled or refunded"
            href="/admin/orders?status=EXPIRED"
            tone={failedOrders > 0 ? "danger" : "default"}
          />
          <Metric
            label="Support queue"
            value={openSupport}
            hint="Failed in the last 7 days"
            href="/admin/support"
            tone={openSupport > 0 ? "warning" : "default"}
          />
          <Metric
            label="Provider balance"
            value={
              !resolved.connected
                ? "Not connected"
                : providerBalanceKobo === null
                  ? "Not reported"
                  : formatNaira(providerBalanceKobo)
            }
            hint={
              !resolved.connected
                ? "No provider to hold credit with"
                : providerBalanceKobo === null
                  ? "This provider does not report one"
                  : "Credit remaining with the provider"
            }
            tone={
              providerBalanceKobo !== null && providerBalanceKobo <= 0
                ? "danger"
                : "default"
            }
          />
        </MetricGrid>
      </section>

      <section>
        <h2 className="mb-2.5 text-sm font-semibold">Money</h2>
        <MetricGrid>
          <Metric
            label="Customer funding"
            value={formatNaira(fundingKobo)}
            hint="Confirmed payments in"
            href="/admin/wallet?type=TOPUP"
          />
          <Metric
            label="Number sales"
            value={formatNaira(salesKobo)}
            hint="Charged to wallets"
            href="/admin/wallet?type=PURCHASE"
          />
          <Metric
            label="Provider cost"
            value={formatNaira(providerCostKobo)}
            hint="Billed on completed orders"
          />
          <Metric
            label="Gross profit"
            value={formatNaira(grossProfitKobo)}
            hint={`${marginPercent}% margin on completed orders`}
            tone={grossProfitKobo > 0 ? "success" : "default"}
          />
          <Metric
            label="Customer balances"
            value={formatNaira(customerBalancesKobo)}
            hint="Held on account, owed to customers"
          />
        </MetricGrid>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecordList
          title="Recent orders"
          viewAllHref="/admin/orders"
          empty="No orders yet."
          rows={recentOrders.map((order) => ({
            key: order.id,
            href: `/admin/orders/${order.id}`,
            title: order.serviceName,
            subtitle: `${order.user.email} · ${formatPhoneNumber(order.phoneNumber)}`,
            amount: formatNaira(order.priceKobo),
            badge: {
              label: ORDER_STATUS_LABEL[order.status],
              variant: ACTIVATION_STATUS_VARIANT[order.status],
            },
          }))}
        />

        <RecordList
          title="Recent wallet activity"
          viewAllHref="/admin/wallet"
          empty="No wallet activity yet."
          rows={recentTransactions.map((tx) => ({
            key: tx.id,
            href: `/admin/wallet/${tx.id}`,
            title: tx.description,
            subtitle: `${tx.user.email} · ${tx.type}`,
            amount: `${tx.status === "SUCCESSFUL" ? (tx.amountKobo >= 0 ? "+" : "-") : ""}${formatNaira(Math.abs(tx.amountKobo))}`,
            badge: {
              label: tx.status,
              variant:
                tx.status === "SUCCESSFUL"
                  ? ("success" as const)
                  : tx.status === "PENDING"
                    ? ("warning" as const)
                    : tx.status === "FAILED"
                      ? ("danger" as const)
                      : ("neutral" as const),
            },
          }))}
        />
      </div>

      {recentFailures.length > 0 ? (
        <RecordList
          title="Recent failed orders"
          icon={<AlertTriangle className="h-4 w-4 text-warning" />}
          viewAllHref="/admin/support"
          empty="No failed orders."
          rows={recentFailures.map((order) => ({
            key: order.id,
            href: `/admin/orders/${order.id}`,
            title: order.serviceName,
            subtitle: `${order.user.email} · ${order.countryName}`,
            amount: `${formatNaira(order.priceKobo)} refunded`,
            badge: {
              label: ORDER_STATUS_LABEL[order.status],
              variant: ACTIVATION_STATUS_VARIANT[order.status],
            },
          }))}
        />
      ) : null}
    </div>
  );
}

interface RecordRow {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  amount: string;
  badge: { label: string; variant: "success" | "warning" | "danger" | "neutral" };
}

/** Every row goes somewhere. A dashboard that names a problem without
 *  linking to the record behind it makes the operator go looking. */
function RecordList({
  title,
  icon,
  viewAllHref,
  rows,
  empty,
}: {
  title: string;
  icon?: React.ReactNode;
  viewAllHref: string;
  rows: RecordRow[];
  empty: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h2>
        <Link
          href={viewAllHref}
          className="-my-2 py-2 text-xs font-medium text-forest hover:underline"
        >
          View all
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-background"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.subtitle}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {row.amount}
                </span>
                <Badge variant={row.badge.variant}>{row.badge.label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
