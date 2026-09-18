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

const TICKET_STATUS_VARIANT = {
  OPEN: "danger",
  PENDING: "warning",
  RESOLVED: "success",
} as const;

/**
 * Two things an admin comes here for: tickets that need a reply, and orders
 * that failed but no one has necessarily looked at yet. Kept on one page,
 * since both are "things a customer is waiting on" and splitting them would
 * just mean checking two pages instead of one.
 */
export default async function AdminSupportPage() {
  await requireAdmin();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const [
    openCount,
    pendingCount,
    resolvedCount,
    tickets,
    failedToday,
    failures,
  ] = await Promise.all([
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
    prisma.supportTicket.count({ where: { status: "PENDING" } }),
    prisma.supportTicket.count({ where: { status: "RESOLVED" } }),
    prisma.supportTicket.findMany({
      where: { status: { in: ["OPEN", "PENDING"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { email: true } } },
    }),
    prisma.activation.count({
      where: { status: { in: [...FAILED_STATUSES] }, createdAt: { gte: startOfToday } },
    }),
    prisma.activation.findMany({
      where: { status: { in: [...FAILED_STATUSES] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { email: true } } },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tickets waiting on a reply, and orders that did not deliver.
        </p>
      </div>

      <MetricGrid>
        <Metric label="Open tickets" value={openCount} tone={openCount > 0 ? "danger" : "default"} />
        <Metric label="Pending tickets" value={pendingCount} />
        <Metric label="Resolved tickets" value={resolvedCount} />
        <Metric label="Failed orders today" value={failedToday} tone={failedToday > 0 ? "warning" : "default"} />
      </MetricGrid>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Tickets needing attention</h2>
        </div>
        {tickets.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing open or pending. All caught up.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/admin/support/${ticket.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-background"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ticket.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ticket.user.email}
                    </p>
                  </div>
                  <time className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {ticket.createdAt.toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                  <Badge variant={TICKET_STATUS_VARIANT[ticket.status]}>
                    {ticket.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Recent failed orders</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Already refunded automatically; listed for pattern-spotting, not
            money owed.
          </p>
        </div>
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
