import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import {
  ACTIVATION_STATUS_VARIANT,
  ORDER_STATUS_LABEL,
} from "@/lib/activation-status";
import { markTicketNotificationsRead } from "@/lib/notifications";
import { TicketAutoRefresh } from "@/components/ticket-auto-refresh";
import { TicketReplyForm } from "./reply-form";

export const metadata: Metadata = { title: "Admin: Ticket" };

export const dynamic = "force-dynamic";

const TICKET_STATUS_VARIANT = {
  OPEN: "danger",
  PENDING: "warning",
  RESOLVED: "success",
} as const;

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();

  // Only this admin's own copy: another admin's unread notification for the
  // same ticket is untouched — see markTicketNotificationsRead()'s doc
  // comment in src/lib/notifications.ts.
  await markTicketNotificationsRead(admin.id, ticket.id);

  const relatedOrder = ticket.relatedActivationId
    ? await prisma.activation.findUnique({ where: { id: ticket.relatedActivationId } })
    : null;

  return (
    <div className="space-y-5">
      <TicketAutoRefresh />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/admin/users/${ticket.userId}`} className="hover:text-forest hover:underline">
              {ticket.user.email}
            </Link>
            <Badge variant={TICKET_STATUS_VARIANT[ticket.status]}>{ticket.status}</Badge>
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Conversation</h2>
            </div>
            <ul className="divide-y divide-border">
              {ticket.messages.map((message) => (
                <li key={message.id} className="px-5 py-4">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {message.author === "ADMIN" ? (
                      <span className="text-forest">
                        {message.adminEmail ?? "Admin"}
                      </span>
                    ) : (
                      <span>{ticket.user.email}</span>
                    )}
                    <span>
                      {message.createdAt.toLocaleString("en-NG", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 whitespace-pre-wrap text-sm",
                      message.author === "ADMIN" && "text-forest",
                    )}
                  >
                    {message.body}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <TicketReplyForm ticketId={ticket.id} status={ticket.status} />
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Customer</h2>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Wallet balance</dt>
                <dd className="tabular-nums">{formatMoney(ticket.user.walletBalanceKobo, ticket.user.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Account status</dt>
                <dd>{ticket.user.deletedAt ? "Deleted" : ticket.user.status}</dd>
              </div>
            </dl>
            <Link
              href={`/admin/users/${ticket.userId}`}
              className="mt-3 inline-block text-xs font-medium text-forest hover:underline"
            >
              View full profile
            </Link>
          </Card>

          {relatedOrder ? (
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold">Related order</h2>
              </div>
              <Link
                href={`/admin/orders/${relatedOrder.id}`}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-background"
              >
                <ActivationLogo
                  serviceSlug={relatedOrder.serviceSlug}
                  serviceName={relatedOrder.serviceName}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{relatedOrder.serviceName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {relatedOrder.countryName} · {formatMoney(relatedOrder.priceKobo, relatedOrder.currency)}
                  </p>
                </div>
                <Badge variant={ACTIVATION_STATUS_VARIANT[relatedOrder.status]}>
                  {ORDER_STATUS_LABEL[relatedOrder.status]}
                </Badge>
              </Link>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
