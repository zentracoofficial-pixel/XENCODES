import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownLeft,
  Banknote,
  Hourglass,
  RotateCcw,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { StatTile } from "../stat-tile";
import type { WalletTransactionType } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin: Payments" };

export const dynamic = "force-dynamic";

const typeMeta = {
  TOPUP: { label: "Top-up", icon: ArrowDownLeft, tone: "bg-success-soft text-success" },
  PURCHASE: { label: "Purchase", icon: ShoppingBag, tone: "bg-background text-foreground" },
  REFUND: { label: "Refund", icon: RotateCcw, tone: "bg-warning-soft text-warning" },
  ADJUSTMENT: { label: "Adjustment", icon: Sparkles, tone: "bg-mint-soft text-forest" },
} as const;

const STATUS_VARIANT = {
  PENDING: "warning",
  SUCCESSFUL: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
} as const;

const filters: { label: string; value: WalletTransactionType | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Top-ups", value: "TOPUP" },
  { label: "Purchases", value: "PURCHASE" },
  { label: "Refunds", value: "REFUND" },
  { label: "Adjustments", value: "ADJUSTMENT" },
];

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireAdmin();

  const { type } = await searchParams;
  const activeFilter = filters.find((f) => f.value === type)?.value ?? "ALL";

  // Every total here counts settled money only. A pending top up is money
  // that has been asked for, not received, and adding it to "topped up"
  // would overstate what the platform actually holds.
  const settled = { status: "SUCCESSFUL" as const };

  const [transactions, purchaseAgg, refundAgg, topupAgg, pendingAgg] =
    await Promise.all([
      prisma.walletTransaction.findMany({
        where: activeFilter === "ALL" ? undefined : { type: activeFilter },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { email: true } } },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: "PURCHASE", ...settled },
        _sum: { amountKobo: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: "REFUND", ...settled },
        _sum: { amountKobo: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: "TOPUP", ...settled },
        _sum: { amountKobo: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: "TOPUP", status: "PENDING" },
        _sum: { amountKobo: true },
        _count: true,
      }),
    ]);

  const grossKobo = Math.abs(purchaseAgg._sum.amountKobo ?? 0);
  const refundedKobo = refundAgg._sum.amountKobo ?? 0;
  const netRevenueKobo = grossKobo - refundedKobo;
  const toppedUpKobo = topupAgg._sum.amountKobo ?? 0;
  const pendingKobo = pendingAgg._sum.amountKobo ?? 0;
  const pendingCount = pendingAgg._count;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every wallet movement across the platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Gross revenue" value={formatNaira(grossKobo)} icon={ShoppingBag} />
        <StatTile label="Net revenue" value={formatNaira(netRevenueKobo)} hint="Purchases minus refunds" icon={Banknote} tone="success" />
        <StatTile
          label="Topped up"
          value={formatNaira(toppedUpKobo)}
          hint="Confirmed payments only"
          icon={ArrowDownLeft}
        />
        <StatTile
          label="Awaiting payment"
          value={formatNaira(pendingKobo)}
          hint={`${pendingCount} pending ${pendingCount === 1 ? "request" : "requests"}`}
          icon={Hourglass}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === "ALL" ? "/admin/payments" : `/admin/payments?type=${f.value}`}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-xs font-medium transition-colors",
              activeFilter === f.value
                ? "border-forest bg-primary text-white"
                : "border-border text-muted-foreground hover:bg-mint-soft",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {transactions.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No transactions match this filter.</p>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((tx) => {
              const meta = typeMeta[tx.type];
              const credit = tx.amountKobo >= 0;
              return (
                <li key={tx.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.tone)}>
                    <meta.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meta.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Link href={`/admin/users/${tx.userId}`} className="hover:text-forest hover:underline">
                        {tx.user.email}
                      </Link>
                      {" "}· {tx.description}
                    </p>
                  </div>
                  {/* Who is moving the money and under what reference, so a
                      payment can be traced back to the provider's own
                      dashboard when something needs reconciling. */}
                  <div className="hidden w-44 shrink-0 lg:block">
                    <p className="truncate text-xs text-muted-foreground">
                      {tx.provider ?? "Internal"}
                    </p>
                    {tx.providerReference ? (
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {tx.providerReference}
                      </p>
                    ) : null}
                  </div>
                  <Badge variant={STATUS_VARIANT[tx.status]}>{tx.status}</Badge>
                  <time className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground lg:block">
                    {tx.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  </time>
                  <span
                    className={cn(
                      "w-28 shrink-0 text-right text-sm font-semibold tabular-nums",
                      tx.status !== "SUCCESSFUL"
                        ? "text-muted-foreground"
                        : credit
                          ? "text-success"
                          : "text-foreground",
                    )}
                  >
                    {tx.status === "SUCCESSFUL" ? (credit ? "+" : "-") : ""}
                    {tx.currency} {formatNaira(Math.abs(tx.amountKobo)).replace(/^₦/, "")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
