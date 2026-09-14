import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Radio,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira, formatPhoneNumber } from "@/lib/currency";
import { getProvider } from "@/lib/provider";
import { StatTile } from "./stat-tile";

export const metadata: Metadata = { title: "Admin: Dashboard" };

// Never statically prerendered: this reads the database and, once a live
// provider is connected, makes real outbound requests, neither of which
// should run at build time.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    todayOrders,
    successful,
    failed,
    totalActivations,
    activeNumbers,
    purchaseAgg,
    refundAgg,
    recentActivations,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.activation.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.activation.count({ where: { status: "RECEIVED" } }),
    prisma.activation.count({
      where: { status: { in: ["EXPIRED", "CANCELLED", "REFUNDED"] } },
    }),
    prisma.activation.count(),
    prisma.activation.count({ where: { status: "WAITING" } }),
    prisma.walletTransaction.aggregate({
      where: { type: "PURCHASE" },
      _sum: { amountKobo: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "REFUND" },
      _sum: { amountKobo: true },
    }),
    prisma.activation.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  // Margin is measured over orders that actually stood, not every order
  // ever placed: a refunded activation returns the customer's money, so
  // counting its markup as earned would overstate what the business kept.
  const keptOrders = await prisma.activation.aggregate({
    where: { status: "RECEIVED" },
    _sum: { priceKobo: true, providerCostKobo: true, markupKobo: true },
  });

  const grossKobo = Math.abs(purchaseAgg._sum.amountKobo ?? 0);
  const refundedKobo = refundAgg._sum.amountKobo ?? 0;
  const netRevenueKobo = grossKobo - refundedKobo;
  const providerCostKobo = keptOrders._sum.providerCostKobo ?? 0;
  const grossMarginKobo = keptOrders._sum.markupKobo ?? 0;
  const soldKobo = keptOrders._sum.priceKobo ?? 0;
  const marginPercent =
    soldKobo > 0 ? Math.round((grossMarginKobo / soldKobo) * 100) : 0;
  const successRate = totalActivations
    ? Math.round((successful / totalActivations) * 100)
    : 0;

  const provider = await getProvider();
  const providerEnabled = provider.isLive;
  const providerName = provider.isLive
    ? provider.label
    : "Development data";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What&apos;s happening across Xencodes right now.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total users" value={totalUsers} icon={Users} />
        <StatTile label="Orders today" value={todayOrders} icon={ShoppingBag} />
        <StatTile
          label="Successful activations"
          value={successful}
          hint={`${successRate}% success rate`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatTile label="Failed activations" value={failed} icon={XCircle} tone="danger" />
        <StatTile
          label="Revenue"
          value={formatNaira(netRevenueKobo)}
          hint="Purchases minus refunds"
          icon={Banknote}
        />
        <StatTile
          label="Provider cost"
          value={formatNaira(providerCostKobo)}
          hint="What SMSPool billed on delivered orders"
          icon={Receipt}
        />
        <StatTile
          label="Gross margin"
          value={formatNaira(grossMarginKobo)}
          hint={`${marginPercent}% of delivered sales`}
          icon={TrendingUp}
          tone={grossMarginKobo > 0 ? "success" : undefined}
        />
        <StatTile
          label="Refunded"
          value={formatNaira(refundedKobo)}
          icon={RotateCcw}
        />
        <StatTile label="Active numbers" value={activeNumbers} icon={Smartphone} />
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Provider
            </p>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                providerEnabled ? "bg-success-soft text-success" : "bg-background text-muted-foreground"
              }`}
            >
              <Radio className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 truncate text-2xl font-semibold">{providerName}</p>
          <Link
            href="/admin/settings"
            className="-mb-2 mt-1 inline-flex items-center gap-1 py-2 text-xs font-medium text-forest hover:underline"
          >
            {providerEnabled ? "Manage connection" : "Connect a provider"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Recent orders</h2>
          <Link href="/admin/orders" className="-my-2 py-2 text-sm font-medium text-forest hover:underline">
            View all
          </Link>
        </div>
        {recentActivations.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No activations yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recentActivations.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.serviceName}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {formatPhoneNumber(a.phoneNumber)} · {a.countryName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatNaira(a.priceKobo)}
                  </span>
                  <Badge
                    variant={
                      a.status === "RECEIVED"
                        ? "success"
                        : a.status === "WAITING"
                          ? "warning"
                          : a.status === "EXPIRED"
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {a.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
