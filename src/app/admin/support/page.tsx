import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import {
  ACTIVATION_STATUS_VARIANT,
  ORDER_STATUS_LABEL,
} from "@/lib/activation-status";
import { Metric, MetricGrid } from "../metric";

export const metadata: Metadata = { title: "Admin: Support" };

export const dynamic = "force-dynamic";

const FAILED_STATUSES = ["EXPIRED", "CANCELLED", "REFUNDED"] as const;

/**
 * The follow-up queue: orders that did not deliver.
 *
 * Every one of them was already refunded automatically, so this is not a
 * list of money to return. It is a list of customers who did not get what
 * they came for, and of services that may be failing repeatedly.
 */
export default async function AdminSupportPage() {
  await requireAdmin();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const [failedToday, failedThisWeek, worstService, refundedAgg, failures] =
    await Promise.all([
      prisma.activation.count({
        where: {
          status: { in: [...FAILED_STATUSES] },
          createdAt: { gte: startOfToday },
        },
      }),
      prisma.activation.count({
        where: {
          status: { in: [...FAILED_STATUSES] },
          createdAt: { gte: startOfWeek },
        },
      }),
      prisma.activation.groupBy({
        by: ["serviceName"],
        where: { status: "EXPIRED", createdAt: { gte: startOfWeek } },
        _count: { serviceName: true },
        orderBy: { _count: { serviceName: "desc" } },
        take: 1,
      }),
      prisma.walletTransaction.aggregate({
        where: { type: "REFUND", createdAt: { gte: startOfWeek } },
        _sum: { amountKobo: true },
      }),
      prisma.activation.findMany({
        where: { status: { in: [...FAILED_STATUSES] } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { email: true } } },
      }),
    ]);

  const worst = worstService[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Orders that did not deliver. Each one was already refunded
          automatically.
        </p>
      </div>

      <MetricGrid>
        <Metric
          label="Failed today"
          value={failedToday}
          tone={failedToday > 0 ? "danger" : "default"}
        />
        <Metric label="Failed this week" value={failedThisWeek} />
        <Metric
          label="Refunded this week"
          value={formatNaira(refundedAgg._sum.amountKobo ?? 0)}
        />
        <Metric
          label="Worth investigating"
          value={worst ? worst.serviceName : "Nothing"}
          hint={
            worst
              ? `${worst._count.serviceName} no-code failures this week`
              : "No repeat failures this week"
          }
          tone={worst ? "warning" : "default"}
        />
      </MetricGrid>

      <Card className="overflow-hidden">
        {failures.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No failed orders. Nothing to follow up on.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {failures.map((order) => (
              <li key={order.id} className="flex items-center gap-3 px-5 py-3">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <ActivationLogo
                    serviceSlug={order.serviceSlug}
                    serviceName={order.serviceName}
                    size="sm"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium hover:text-forest">
                      {order.serviceName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {order.user.email} · {order.countryName}
                    </span>
                  </span>
                </Link>
                <Badge variant={ACTIVATION_STATUS_VARIANT[order.status]}>
                  {ORDER_STATUS_LABEL[order.status]}
                </Badge>
                <span className="hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:inline">
                  {formatNaira(order.priceKobo)} refunded
                </span>
                <time className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground lg:block">
                  {order.createdAt.toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                  })}
                </time>
                <a
                  href={`mailto:${order.user.email}?subject=${encodeURIComponent(`Your Xencodes order for ${order.serviceName}`)}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-mint-soft hover:text-foreground"
                  title={`Email ${order.user.email}`}
                >
                  <Mail className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
