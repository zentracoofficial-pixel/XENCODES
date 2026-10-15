import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, Banknote, CheckCircle2, LineChart, PlugZap, ShoppingBag, Users } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { getRecentActivity } from "@/lib/admin-activity";
import { addDays, getDailySales, lagosDateKey, sumDays } from "@/lib/sales-report";
import { ProfitChart } from "./sales/profit-chart";
import { buildChartPoints } from "./sales/chart-data";

export const metadata: Metadata = { title: "Admin: Dashboard" };

// Never statically prerendered: this reads the database and, once a live
// provider is connected, makes real outbound requests, neither of which
// should run at build time.
export const dynamic = "force-dynamic";

const ACTIVITY_LIMIT = 15;
const TREND_DAYS = 14;

export default async function AdminDashboardPage() {
  await requireAdmin();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  // Daily sales for the trend card, started now so it loads alongside the
  // counts below.
  const trendTo = lagosDateKey();
  const trendFrom = addDays(trendTo, -(TREND_DAYS - 1));
  const trendRowsPromise = getDailySales(trendFrom, trendTo);

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
    activity,
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
    getRecentActivity({ limit: ACTIVITY_LIMIT }),
    getNumberProvider(),
  ]);

  const defaultCurrency = await getDefaultCurrency();
  const trendRows = await trendRowsPromise;
  const trendPoints = buildChartPoints(trendRows, defaultCurrency.code, trendFrom, trendTo);
  const trendTotals = sumDays(trendRows, defaultCurrency.code, trendFrom, trendTo);
  const todayTotals = sumDays(trendRows, defaultCurrency.code, trendTo, trendTo);

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

  // What needs a look right now, built only from the figures above. Each item
  // links to the screen where it is dealt with.
  const attention: AttentionItem[] = [];
  if (!resolved.connected) {
    attention.push({ tone: "danger", title: "No number provider connected", detail: "Customers cannot buy numbers.", href: "/admin/settings" });
  }
  if (providerBalanceStatus?.isLow) {
    attention.push({ tone: "danger", title: "Provider balance is low", detail: "Top up the supplier account to keep selling.", href: "/admin/providers" });
  }
  if (pendingOrders > 0) {
    attention.push({
      tone: "warning",
      title: `${pendingOrders} ${pendingOrders === 1 ? "order is" : "orders are"} waiting on a code`,
      detail: "Open orders that have not received an SMS yet.",
      href: "/admin/orders?status=WAITING",
    });
  }
  if (openSupport > 0) {
    attention.push({
      tone: "warning",
      title: `${openSupport} failed ${openSupport === 1 ? "order" : "orders"} in the last 7 days`,
      detail: "Expired, cancelled or refunded; customers may get in touch.",
      href: "/admin/support",
    });
  }
  for (const signal of health) {
    if (signal.state === "ok") continue;
    attention.push({
      tone: signal.state === "error" ? "danger" : "warning",
      title: signal.label,
      detail: signal.detail,
      href: "#system-health",
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest/70">Admin console</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What is happening across Xencodes right now.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickLink href="/admin/orders" icon={ShoppingBag} label="Orders" />
          <QuickLink href="/admin/users" icon={Users} label="Users" />
          <QuickLink href="/admin/sales" icon={LineChart} label="Sales" />
        </div>
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

      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="flex flex-col justify-between gap-5 border-b border-border bg-gradient-to-br from-forest to-forest-dark p-5 text-white sm:p-6 lg:border-b-0 lg:border-r">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Profit today</p>
              <p className="mt-1.5 text-4xl font-semibold tracking-tight">{formatMoney(todayTotals.profitMinor, defaultCurrency.code)}</p>
              <p className="mt-1 text-sm text-white/65">
                {todayTotals.sales} {todayTotals.sales === 1 ? "sale" : "sales"} ·{" "}
                {formatMoney(todayTotals.revenueMinor, defaultCurrency.code)} revenue
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.08em] text-white/50">{TREND_DAYS}-day profit</dt>
                <dd className="mt-0.5 font-semibold">{formatMoney(trendTotals.profitMinor, defaultCurrency.code)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.08em] text-white/50">{TREND_DAYS}-day sales</dt>
                <dd className="mt-0.5 font-semibold">{trendTotals.sales}</dd>
              </div>
            </dl>
            <Link
              href="/admin/sales"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-mint underline-offset-4 hover:underline"
            >
              Full sales and profit report
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Last {TREND_DAYS} days</h2>
              <p className="text-xs text-muted-foreground">Completed sales, amounts in {defaultCurrency.code}</p>
            </div>
            <ProfitChart
              points={trendPoints}
              currency={defaultCurrency.code}
              height={210}
              emptyText={`No completed sales in the last ${TREND_DAYS} days.`}
            />
          </div>
        </div>
      </Card>

      <AttentionPanel items={attention} />

      <ProviderBalanceCard
        label={primaryProvider?.label ?? "Number provider"}
        connected={Boolean(primaryProvider)}
        supportsBalance={typeof primaryProvider?.provider.getProviderBalanceUsdCents === "function"}
        status={providerBalanceStatus}
      />

      <section>
        <SectionHeading
          icon={Activity}
          title="Operations"
          description="Customers and orders. Every figure opens the records behind it."
        />
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
        <SectionHeading
          icon={Banknote}
          title="Money"
          description="Each currency is added up on its own, never blended."
          action={{ href: "/admin/sales", label: "Sales and profit by day, week and month" }}
        />
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
            hint="Completed orders, all time"
            href="/admin/sales"
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

      <div id="system-health" className="scroll-mt-24">
        <SystemHealthCard signals={health} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              New users, funding, purchases, activations, support and email
              campaigns, together in one timeline.
            </p>
          </div>
          <Link
            href="/admin/activity"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-forest transition-colors hover:border-mint hover:bg-mint-soft"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
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
                  className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-mint-soft/50"
                >
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 shrink-0 rounded-full", ACTIVITY_DOT[row.badge.variant] ?? "bg-forest")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.subtitle}
                    </p>
                  </div>
                  <time className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
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

const ACTIVITY_DOT: Record<string, string> = {
  default: "bg-forest",
  neutral: "bg-muted-foreground/50",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  forest: "bg-forest",
};

interface AttentionItem {
  tone: "danger" | "warning";
  title: string;
  detail: string;
  href: string;
}

/** What needs a look, most serious first, or a plain all-clear. */
function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const sorted = [...items].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));
  if (sorted.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success-soft px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-white">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-success">All clear</p>
          <p className="text-xs text-success/80">No pending orders, recent failures or system problems need a look.</p>
        </div>
      </div>
    );
  }
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Needs attention
        </h2>
        <Badge variant={sorted[0].tone === "danger" ? "danger" : "warning"}>
          {sorted.length} {sorted.length === 1 ? "item" : "items"}
        </Badge>
      </div>
      <ul className="divide-y divide-border">
        {sorted.map((item) => (
          <li key={item.title}>
            <Link href={item.href} className="group flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-mint-soft/50">
              <span
                aria-hidden
                className={cn("h-8 w-1 shrink-0 rounded-full", item.tone === "danger" ? "bg-danger" : "bg-warning")}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold", item.tone === "danger" ? "text-danger" : "text-warning")}>
                  {item.title}
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-forest" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint-soft text-forest">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 text-sm font-medium text-forest underline-offset-4 hover:underline"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground shadow-[var(--shadow-subtle)] transition-colors hover:border-mint hover:bg-mint-soft"
    >
      <Icon className="h-4 w-4 text-forest" />
      {label}
    </Link>
  );
}
