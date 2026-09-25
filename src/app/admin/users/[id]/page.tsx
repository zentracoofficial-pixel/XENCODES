import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatPhoneNumber } from "@/lib/currency";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import { UserActions } from "./user-actions";
import {
  ACTIVATION_STATUS_VARIANT,
  ORDER_STATUS_LABEL,
} from "@/lib/activation-status";
import { WALLET_STATUS_VARIANT } from "@/lib/wallet-status";
import { Metric, MetricGrid } from "../../metric";
import { getUserDeletionImpact } from "../actions";

export const metadata: Metadata = { title: "Admin: User" };

export const dynamic = "force-dynamic";

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * One customer, with everything about them on one page: who they are, what
 * they hold, what they bought, what they paid in, and the controls for
 * their account. A separate page per activity would mean four clicks to
 * answer one support question.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      activations: { orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { activations: true } },
    },
  });

  if (!user) notFound();

  const [funding, movements, spendAgg, fundedAgg, supportTickets, deletionImpact] =
    await Promise.all([
      prisma.walletTransaction.findMany({
        where: { userId: id, type: "TOPUP" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.walletTransaction.findMany({
        where: { userId: id, type: { in: ["PURCHASE", "REFUND", "ADJUSTMENT"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.walletTransaction.aggregate({
        where: { userId: id, type: "PURCHASE", status: "SUCCESSFUL" },
        _sum: { amountKobo: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { userId: id, type: "TOPUP", status: "SUCCESSFUL" },
        _sum: { amountKobo: true },
      }),
      prisma.supportTicket.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      getUserDeletionImpact(id),
    ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.email}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Joined{" "}
            {user.createdAt.toLocaleDateString("en-NG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {user.lastLoginAt ? (
              <>
                · Last active{" "}
                {user.lastLoginAt.toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </>
            ) : (
              <>· Never signed in since activity tracking began</>
            )}
            <Badge
              variant={
                user.deletedAt ? "neutral" : user.status === "ACTIVE" ? "success" : "danger"
              }
            >
              {user.deletedAt ? "DELETED" : user.status}
            </Badge>
            {user.role === "ADMIN" ? <Badge variant="default">Admin</Badge> : null}
          </p>
        </div>
      </div>

      <MetricGrid>
        <Metric label="Wallet balance" value={formatMoney(user.walletBalanceKobo, user.currency)} />
        <Metric
          label="Total funded"
          value={formatMoney(fundedAgg._sum.amountKobo ?? 0, user.currency)}
          hint="Confirmed payments"
        />
        <Metric
          label="Total spent"
          value={formatMoney(Math.abs(spendAgg._sum.amountKobo ?? 0), user.currency)}
          hint="On numbers"
        />
        <Metric label="Orders" value={user._count.activations} />
      </MetricGrid>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Recent orders</h2>
              {user._count.activations > 0 ? (
                <Link
                  href={`/admin/orders?q=${encodeURIComponent(user.email)}`}
                  className="text-xs font-medium text-forest hover:underline"
                >
                  View all {user._count.activations}
                </Link>
              ) : null}
            </div>
            {user.activations.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No orders yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {user.activations.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-background"
                    >
                      <ActivationLogo
                        serviceSlug={order.serviceSlug}
                        serviceName={order.serviceName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {order.serviceName}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {formatPhoneNumber(order.phoneNumber)} · {order.countryName}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatMoney(order.priceKobo, order.currency)}
                      </span>
                      <Badge variant={ACTIVATION_STATUS_VARIANT[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Funding history</h2>
            </div>
            {funding.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                This customer has never added funds.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {funding.map((tx) => (
                  <li key={tx.id}>
                    <Link
                      href={`/admin/wallet/${tx.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-background"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {tx.provider ?? "Internal"}
                        </p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {tx.providerReference ?? "No reference"}
                        </p>
                      </div>
                      <time className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        {tx.createdAt.toLocaleString("en-NG", dateFormat)}
                      </time>
                      <Badge variant={WALLET_STATUS_VARIANT[tx.status]}>
                        {tx.status}
                      </Badge>
                      <span
                        className={cn(
                          "w-24 shrink-0 text-right text-sm font-semibold tabular-nums",
                          tx.status === "SUCCESSFUL"
                            ? "text-success"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatMoney(Math.abs(tx.amountKobo), tx.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Other wallet movements</h2>
            </div>
            {movements.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No purchases, refunds or adjustments yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {movements.map((tx) => (
                  <li key={tx.id}>
                    <Link
                      href={`/admin/wallet/${tx.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-background"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{tx.type}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {tx.description}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-semibold tabular-nums",
                          tx.amountKobo >= 0 ? "text-success" : "text-foreground",
                        )}
                      >
                        {tx.amountKobo >= 0 ? "+" : "-"}
                        {formatMoney(Math.abs(tx.amountKobo), tx.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Support history</h2>
            </div>
            {supportTickets.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No support tickets.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {supportTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/admin/support/${ticket.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-background"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{ticket.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ticket.createdAt.toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <Badge
                        variant={
                          ticket.status === "OPEN"
                            ? "danger"
                            : ticket.status === "PENDING"
                              ? "warning"
                              : "success"
                        }
                      >
                        {ticket.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <UserActions
          userId={user.id}
          email={user.email}
          status={user.status}
          role={user.role}
          currency={user.currency}
          isSelf={admin.id === user.id}
          isDeleted={Boolean(user.deletedAt)}
          deletionImpact={deletionImpact}
        />
      </div>
    </div>
  );
}
