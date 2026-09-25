import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import {
  ACTIVATION_STATUS_VARIANT,
  ORDER_STATUS_LABEL,
} from "@/lib/activation-status";
import { markTicketNotificationsRead } from "@/lib/notifications";
import { TicketAutoRefresh } from "@/components/ticket-auto-refresh";
import { TicketReplyForm } from "./ticket-reply-form";

export const metadata: Metadata = { title: "Support ticket" };

export const dynamic = "force-dynamic";

const TICKET_STATUS_VARIANT = {
  OPEN: "danger",
  PENDING: "warning",
  RESOLVED: "success",
} as const;

const TICKET_STATUS_LABEL = {
  OPEN: "Open",
  PENDING: "Waiting on us",
  RESOLVED: "Resolved",
} as const;

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  // Scoped to the signed-in customer's own ticket by the query itself, so
  // one customer cannot read another's thread by guessing an id.
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();

  // Viewing this exact ticket is what "read" means — see
  // markTicketNotificationsRead() in src/lib/notifications.ts.
  await markTicketNotificationsRead(userId, ticket.id);

  const relatedOrder = ticket.relatedActivationId
    ? await prisma.activation.findFirst({
        where: { id: ticket.relatedActivationId, userId },
      })
    : null;

  return (
    <div className="space-y-5">
      <TicketAutoRefresh />
      <Link
        href="/dashboard/support"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to support
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opened{" "}
            {ticket.createdAt.toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <Badge variant={TICKET_STATUS_VARIANT[ticket.status]}>
          {TICKET_STATUS_LABEL[ticket.status]}
        </Badge>
      </div>

      {relatedOrder ? (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            About this order
          </div>
          <div className="flex items-center gap-3 px-5 py-3.5">
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
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">Conversation</h2>
        </div>
        <ul className="divide-y divide-border">
          {ticket.messages.map((message) => (
            <li key={message.id} className="px-5 py-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {message.author === "ADMIN" ? (
                  <span className="text-forest">Xencodes support</span>
                ) : (
                  <span>You</span>
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

      <TicketReplyForm ticketId={ticket.id} />
    </div>
  );
}
