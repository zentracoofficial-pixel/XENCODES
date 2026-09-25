import { prisma } from "@/lib/prisma";
import type { SupportTicket } from "@/generated/prisma/client";

/**
 * In-dashboard notifications for the support system. Every write here is a
 * real row tied to a real recipient and a real ticket — nothing about
 * "unread" or "who gets notified" is ever decided on the client, so a badge
 * count or a notification list is only ever a read of what actually
 * happened.
 */

const SNIPPET_LENGTH = 140;

function snippet(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > SNIPPET_LENGTH ? `${trimmed.slice(0, SNIPPET_LENGTH)}…` : trimmed;
}

/**
 * Raised whenever a customer adds to a ticket — a brand-new one or a
 * follow-up reply. Every active admin gets their own row, not a single
 * shared one: opening the ticket as one admin must not silently mark it
 * read for every other admin too (see markTicketNotificationsRead below).
 *
 * Takes the customer directly rather than looking it up from ticket.userId,
 * since every call site already has the row in hand (it just created or
 * loaded it) — an admin needs to know *who* wrote in, not just which ticket,
 * so the title always names them.
 */
export async function notifyAdminsOfSupportMessage(
  ticket: Pick<SupportTicket, "id" | "subject">,
  customer: { email: string; name: string | null },
  messageBody: string,
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const who = customer.name?.trim() || customer.email;
  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      ticketId: ticket.id,
      title: `${who}: ${ticket.subject}`,
      body: snippet(messageBody),
    })),
  });
}

/** Raised whenever an admin replies. In-dashboard only — this deliberately
 *  does not send an email; see replyToTicketAction in
 *  src/app/admin/support/actions.ts. */
export async function notifyUserOfSupportReply(
  ticket: Pick<SupportTicket, "id" | "subject" | "userId">,
  messageBody: string,
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: ticket.userId,
      ticketId: ticket.id,
      title: `Support replied: ${ticket.subject}`,
      body: snippet(messageBody),
    },
  });
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listRecentNotifications(userId: string, limit = 10) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Marks every unread notification a given recipient has for a given ticket
 * as read. Called from the ticket detail page itself — both the customer's
 * (src/app/dashboard/support/[id]/page.tsx) and the admin's
 * (src/app/admin/support/[id]/page.tsx) — the moment that exact recipient's
 * server-rendered view of that exact ticket loads. Never triggered from a
 * client click alone: a notification can only become "read" by the thing it
 * points at actually being opened, server side.
 */
export async function markTicketNotificationsRead(userId: string, ticketId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, ticketId, readAt: null },
    data: { readAt: new Date() },
  });
}
