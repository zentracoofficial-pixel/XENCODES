import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatMultiCurrencySum } from "@/lib/currency";
import { getDefaultCurrency } from "@/lib/currency-config";
import { getNumberProvider, getEnabledProviders, PROVIDER_UNAVAILABLE_COPY } from "@/lib/provider";
import { realisedMargin } from "@/lib/pricing";
import { getSystemHealth } from "@/lib/system-health";
import { checkProviderBalance, getProviderBalanceStatus } from "@/lib/provider-balance-monitor";
import { Metric, MetricGrid } from "./metric";
import { SystemHealthCard } from "./system-health-card";
import { ProviderBalanceCard } from "./provider-balance-card";

export const metadata: Metadata = { title: "Admin: Dashboard" };

// Never statically prerendered: this reads the database and, once a live
// provider is connected, makes real outbound requests, neither of which
// should run at build time.
export const dynamic = "force-dynamic";

const ACTIVITY_LIMIT = 15;
const PER_SOURCE_LIMIT = 10;

export default async function AdminDashboardPage() {
  await requireAdmin();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const [
    totalUsers,
    newUsersToday,
    totalOrders,
    todayOrders,
    pendingOrders,
    completedOrders,
    failedOrders,
    openSupport,
    fundingAgg,
    deliveredAgg,
    balancesAgg,
    newUserRows,
    fundedRows,
    purchaseRows,
    completedRows,
    failedRows,
    ticketRows,
    campaignRows,
    resolved,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: startOfToday } } }),
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
    // Money customers actually paid in, grouped by currency: a Naira total
    // and a Cedi total are different facts, never one blended figure. Money
    // customers actually paid in. Pending top ups are money asked for, not
    // received, so they are not counted here.
    prisma.walletTransaction.groupBy({
      by: ["currency"],
      where: { type: "TOPUP", status: "SUCCESSFUL" },
      _sum: { amountKobo: true },
    }),
    // Number sales, provider cost and gross profit are all measured over
    // orders that actually stood (status RECEIVED) — never a WAITING order
    // still in flight, and never one that ended EXPIRED, CANCELLED or
    // REFUNDED. Each of those three reverses the customer's original debit
    // with its own REFUND WalletTransaction (see getActivationStateAction()
    // and cancelActivationAction() in src/app/dashboard/buy/actions.ts), so
    // summing WalletTransaction PURCHASE rows instead — the earlier
    // approach here — would keep counting a sale the business no longer
    // has the money for.
    prisma.activation.groupBy({
      by: ["currency"],
      where: { status: "RECEIVED" },
      _sum: { priceKobo: true, providerCostKobo: true, grossProfitKobo: true },
    }),
    prisma.user.groupBy({ by: ["currency"], _sum: { walletBalanceKobo: true } }),
    // The seven kinds of event a "recent activity" feed is meant to show,
    // fetched separately (each table has its own shape and timestamp) and
    // merged below rather than forced into one query.
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: { id: true, email: true, createdAt: true },
    }),
    prisma.walletTransaction.findMany({
      where: { type: "TOPUP", status: "SUCCESSFUL" },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      include: { user: { select: { email: true } } },
    }),
    prisma.activation.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      include: { user: { select: { email: true } } },
    }),
    prisma.activation.findMany({
      where: { status: "RECEIVED" },
      orderBy: { receivedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      include: { user: { select: { email: true } } },
    }),
    prisma.activation.findMany({
      where: { status: { in: ["EXPIRED", "CANCELLED", "REFUNDED"] } },
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      include: { user: { select: { email: true } } },
    }),
    prisma.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      include: { user: { select: { email: true } } },
    }),
    prisma.emailCampaign.findMany({
      where: { status: { in: ["SENT", "FAILED"] } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
    }),
    getNumberProvider(),
  ]);

  const defaultCurrency = await getDefaultCurrency();

  const fundingRows = fundingAgg.map((row) => ({ currency: row.currency, amount: row._sum.amountKobo ?? 0 }));
  // Same RECEIVED-only source deliveredAgg already provides provider cost
  // and gross profit from, so "Number sales" can never disagree with them
  // about which orders actually count.
  const salesRows = deliveredAgg.map((row) => ({ currency: row.currency, amount: row._sum.priceKobo ?? 0 }));
  const providerCostRows = deliveredAgg.map((row) => ({ currency: row.currency, amount: row._sum.providerCostKobo ?? 0 }));
  const grossProfitRows = deliveredAgg.map((row) => ({ currency: row.currency, amount: row._sum.grossProfitKobo ?? 0 }));
  const balanceRows = balancesAgg.map((row) => ({ currency: row.currency, amount: row._sum.walletBalanceKobo ?? 0 }));

  // A single blended percentage across currencies would be as meaningless
  // as a single blended sum. With one currency carrying volume (today's
  // reality) this is exactly the old single figure; with more than one, each
  // currency's own margin is shown rather than one figure claiming to speak
  // for all of them.
  const marginByCurrency = deliveredAgg
    .filter((row) => (row._sum.priceKobo ?? 0) !== 0)
    .map((row) => ({
      currency: row.currency,
      percent: realisedMargin(row._sum.priceKobo ?? 0, row._sum.providerCostKobo ?? 0),
    }));
  const marginHint =
    marginByCurrency.length === 0
      ? "0% margin on completed orders"
      : marginByCurrency.length === 1
        ? `${marginByCurrency[0].percent}% margin on completed orders`
        : marginByCurrency.map((m) => `${m.currency} ${m.percent}%`).join(", ") +
          " margin on completed orders";

  // Only asked for when a provider is connected and actually reports it.
  // Three distinct answers, because "no provider", "this one does not tell
  // us" and "it told us and the number is low" call for different actions.
  // Always US cents (suppliers in this space bill and hold balance in USD
  // regardless of which currencies customers pay in), so this is always
  // shown in USD, never converted into any customer-facing currency.
  //
  // Routed through checkProviderBalance() rather than calling the adapter
  // directly: this is the exact same single request to the provider (no
  // new API call added), but it also updates ProviderBalanceStatus and
  // fires the low-credit admin alert as a side effect — the admin
  // dashboard loading is one of the two places (the other is the daily
  // sync cron) balance monitoring rides along on, rather than polling on
  // its own schedule.
  const enabledProviders = await getEnabledProviders();
  const primaryProvider = enabledProviders[0];
  const providerBalanceUsdCents = primaryProvider
    ? (await checkProviderBalance(primaryProvider.id, primaryProvider.label, primaryProvider.provider)).balanceUsdCents
    : null;
  const providerBalanceStatus = primaryProvider ? await getProviderBalanceStatus(primaryProvider.id) : null;

  const health = await getSystemHealth();

  const activity: ActivityRow[] = [
    ...newUserRows.map((user) => ({
      key: `user-${user.id}`,
      href: `/admin/users/${user.id}`,
      title: "New user registration",
      subtitle: user.email,
      at: user.createdAt,
      badge: { label: "New user", variant: "neutral" as const },
    })),
    ...fundedRows.map((tx) => ({
      key: `funded-${tx.id}`,
      href: `/admin/wallet/${tx.id}`,
      title: "Wallet funding",
      subtitle: `${tx.user.email} · ${formatMoney(tx.amountKobo, tx.currency)}`,
      at: tx.completedAt ?? tx.createdAt,
      badge: { label: "Funded", variant: "success" as const },
    })),
    ...purchaseRows.map((order) => ({
      key: `purchase-${order.id}`,
      href: `/admin/orders/${order.id}`,
      title: "Number purchase",
      subtitle: `${order.user.email} · ${order.serviceName}`,
      at: order.createdAt,
      badge: { label: "Purchase", variant: "neutral" as const },
    })),
    ...completedRows.map((order) => ({
      key: `completed-${order.id}`,
      href: `/admin/orders/${order.id}`,
      title: "Completed activation",
      subtitle: `${order.user.email} · ${order.serviceName}`,
      at: order.receivedAt ?? order.updatedAt,
      badge: { label: "Completed", variant: "success" as const },
    })),
    ...failedRows.map((order) => ({
      key: `failed-${order.id}`,
      href: `/admin/orders/${order.id}`,
      title: "Failed activation",
      subtitle: `${order.user.email} · ${order.serviceName}`,
      at: order.updatedAt,
      badge: { label: "Failed", variant: "danger" as const },
    })),
    ...ticketRows.map((ticket) => ({
      key: `ticket-${ticket.id}`,
      href: `/admin/support/${ticket.id}`,
      title: "Support ticket",
      subtitle: `${ticket.user.email} · ${ticket.subject}`,
      at: ticket.createdAt,
      badge: { label: ticket.status, variant: "warning" as const },
    })),
    ...campaignRows.map((campaign) => ({
      key: `campaign-${campaign.id}`,
      href: "/admin/email?tab=history",
      title: "Admin email campaign",
      subtitle: `${campaign.subject} · ${campaign.recipientCount} recipients`,
      at: campaign.sentAt ?? campaign.createdAt,
      badge: {
        label: campaign.status,
        variant: campaign.status === "SENT" ? ("success" as const) : ("danger" as const),
      },
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, ACTIVITY_LIMIT);

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

      <ProviderBalanceCard
        label={primaryProvider?.label ?? "Number provider"}
        connected={Boolean(primaryProvider)}
        supportsBalance={typeof primaryProvider?.provider.getProviderBalanceUsdCents === "function"}
        status={providerBalanceStatus}
      />

      <section>
        <h2 className="mb-2.5 text-sm font-semibold">Operations</h2>
        <MetricGrid>
          <Metric label="Total users" value={totalUsers} href="/admin/users" />
          <Metric
            label="New users"
            value={newUsersToday}
            hint="Today"
            href="/admin/users?sort=newest"
          />
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
            hint="Failed orders in the last 7 days"
            href="/admin/support"
            tone={openSupport > 0 ? "warning" : "default"}
          />
          <Metric
            label="Provider balance"
            value={
              !resolved.connected
                ? "Not connected"
                : providerBalanceUsdCents === null
                  ? "Not reported"
                  : formatMoney(providerBalanceUsdCents, "USD")
            }
            hint={
              !resolved.connected
                ? "No provider to hold credit with"
                : providerBalanceUsdCents === null
                  ? "This provider does not report one"
                  : "Credit remaining with the provider, in USD"
            }
            tone={
              providerBalanceUsdCents !== null && providerBalanceUsdCents <= 0
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
            value={formatMultiCurrencySum(fundingRows, defaultCurrency.code)}
            hint="Confirmed payments in"
            href="/admin/wallet?type=TOPUP"
          />
          <Metric
            label="Number sales"
            value={formatMultiCurrencySum(salesRows, defaultCurrency.code)}
            hint="Charged to wallets"
            href="/admin/wallet?type=PURCHASE"
          />
          <Metric
            label="Provider cost"
            value={formatMultiCurrencySum(providerCostRows, defaultCurrency.code)}
            hint="Billed on completed orders"
          />
          <Metric
            label="Gross profit"
            value={formatMultiCurrencySum(grossProfitRows, defaultCurrency.code)}
            hint={marginHint}
            tone={grossProfitRows.some((row) => row.amount > 0) ? "success" : "default"}
          />
          <Metric
            label="Customer balances"
            value={formatMultiCurrencySum(balanceRows, defaultCurrency.code)}
            hint="Held on account, owed to customers"
          />
        </MetricGrid>
      </section>

      <SystemHealthCard signals={health} />

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            New users, funding, purchases, activations, support and email
            campaigns, together in one timeline.
          </p>
        </div>
        {activity.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing has happened yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((row) => (
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
                  <time className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {row.at.toLocaleString("en-NG", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  <Badge variant={row.badge.variant}>{row.badge.label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

interface ActivityRow {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  at: Date;
  badge: { label: string; variant: "success" | "warning" | "danger" | "neutral" };
}
