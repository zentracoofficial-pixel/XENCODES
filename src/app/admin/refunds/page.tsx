import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { StatTile } from "../stat-tile";

export const metadata: Metadata = { title: "Admin: Refunds" };

export default async function AdminRefundsPage() {
  const [refunds, refundAgg, totalActivations, failedActivations] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { type: "REFUND" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true } } },
    }),
    prisma.walletTransaction.aggregate({ where: { type: "REFUND" }, _sum: { amountKobo: true } }),
    prisma.activation.count(),
    prisma.activation.count({ where: { status: { in: ["EXPIRED", "CANCELLED"] } } }),
  ]);

  const refundedKobo = refundAgg._sum.amountKobo ?? 0;
  const refundRate = totalActivations ? Math.round((failedActivations / totalActivations) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Refunds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Automatic refunds, issued when a number expires with no code or a customer cancels.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Total refunded" value={formatNaira(refundedKobo)} icon={Banknote} />
        <StatTile label="Refunds issued" value={refunds.length} icon={RotateCcw} />
        <StatTile
          label="Refund rate"
          value={`${refundRate}%`}
          hint="Share of all orders that failed"
          icon={AlertTriangle}
          tone={refundRate > 20 ? "danger" : "default"}
        />
      </div>

      <Card className="overflow-hidden">
        {refunds.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No refunds issued yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {refunds.map((refund) => (
              <li key={refund.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                  <RotateCcw className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{refund.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <Link href={`/admin/users/${refund.userId}`} className="hover:text-forest hover:underline">
                      {refund.user.email}
                    </Link>
                  </p>
                </div>
                <time className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
                  {refund.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                </time>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-warning">
                  +{formatNaira(refund.amountKobo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
