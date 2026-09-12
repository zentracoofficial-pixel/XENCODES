import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownLeft,
  Banknote,
  RotateCcw,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { StatTile } from "../stat-tile";
import type { WalletTransactionType } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin — Payments" };

const typeMeta = {
  TOPUP: { label: "Top-up", icon: ArrowDownLeft, tone: "bg-success-muted text-success" },
  PURCHASE: { label: "Purchase", icon: ShoppingBag, tone: "bg-secondary text-foreground" },
  REFUND: { label: "Refund", icon: RotateCcw, tone: "bg-warning-muted text-warning" },
  ADJUSTMENT: { label: "Adjustment", icon: Sparkles, tone: "bg-primary-muted text-primary" },
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
  const { type } = await searchParams;
  const activeFilter = filters.find((f) => f.value === type)?.value ?? "ALL";

  const [transactions, purchaseAgg, refundAgg, topupAgg] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: activeFilter === "ALL" ? undefined : { type: activeFilter },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true } } },
    }),
    prisma.walletTransaction.aggregate({ where: { type: "PURCHASE" }, _sum: { amountKobo: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "REFUND" }, _sum: { amountKobo: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "TOPUP" }, _sum: { amountKobo: true } }),
  ]);

  const grossKobo = Math.abs(purchaseAgg._sum.amountKobo ?? 0);
  const refundedKobo = refundAgg._sum.amountKobo ?? 0;
  const netRevenueKobo = grossKobo - refundedKobo;
  const toppedUpKobo = topupAgg._sum.amountKobo ?? 0;

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
        <StatTile label="Refunded" value={formatNaira(refundedKobo)} icon={RotateCcw} />
        <StatTile label="Topped up" value={formatNaira(toppedUpKobo)} icon={ArrowDownLeft} />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === "ALL" ? "/admin/payments" : `/admin/payments?type=${f.value}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              activeFilter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary",
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
                      <Link href={`/admin/users/${tx.userId}`} className="hover:text-primary hover:underline">
                        {tx.user.email}
                      </Link>
                      {" "}· {tx.description}
                    </p>
                  </div>
                  <time className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground lg:block">
                    {tx.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  </time>
                  <span className={cn("shrink-0 text-sm font-semibold tabular-nums", credit ? "text-success" : "text-foreground")}>
                    {credit ? "+" : "−"}
                    {formatNaira(Math.abs(tx.amountKobo))}
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
