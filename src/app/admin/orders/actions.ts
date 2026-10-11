"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { renderEmail } from "@/lib/email-template";
import { sendEmailSafe } from "@/lib/email";
import { supportMessageToCustomerEmail } from "@/lib/email-messages";
import { notifyUserOfSupportReply } from "@/lib/notifications";
import {
  adminForceRefundActivation,
  reconcileActivation,
  type AdminRefundReason,
} from "@/lib/activation-lifecycle";

export interface AdminRefundActionResult {
  error?: string;
  success?: boolean;
}

/**
 * The admin panel's "Refund" button. Never a bare wallet credit from the
 * click alone: adminForceRefundActivation() re-verifies the order against
 * the provider first (the same real check a customer's own poll would run)
 * and only forces a refund if that check leaves it genuinely still pending.
 * Strict eligibility is enforced there, atomically, not here — this is only
 * the auth boundary and the audit trail.
 */
export async function adminRefundActivationAction(
  activationId: string,
  reason: AdminRefundReason,
  note: string,
): Promise<AdminRefundActionResult> {
  const admin = await requireAdmin();

  const result = await adminForceRefundActivation(
    activationId,
    { reason, note: note.trim() || undefined },
    { id: admin.id, email: admin.email },
  );

  if (!result.ok) {
    return { error: result.reason };
  }

  await recordAudit({
    actor: admin,
    action: "order.admin_refund",
    targetType: "activation",
    targetId: activationId,
    metadata: { reason, note: note.trim() || null },
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${activationId}`);
  return { success: true };
}

export interface AdminRecheckResult {
  error?: string;
  status?: string;
}

/**
 * A lighter "just check, don't force anything" action for a WAITING order:
 * the admin equivalent of the customer's own polling, useful when an admin
 * wants to know right now whether a code actually arrived before deciding
 * whether to refund at all.
 */
export async function adminRecheckActivationAction(
  activationId: string,
): Promise<AdminRecheckResult> {
  await requireAdmin();

  const result = await reconcileActivation(activationId, "ADMIN_MANUAL_CHECK");
  if (!result) return { error: "That order no longer exists." };

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${activationId}`);
  return { status: result.status };
}

export interface ContactCustomerResult {
  error?: string;
  success?: boolean;
  ticketId?: string;
  emailed?: boolean;
}

/**
 * Starts (or continues) a conversation with the customer who placed an
 * order, from that order's page. It is the ordinary support thread, tied to
 * the order, so the customer replies in their dashboard and it lands in the
 * admin support inbox like any other ticket. The customer is told in two
 * ways: the in-dashboard bell, and a short email (best effort: the thread is
 * the record, so a failed email does not fail the message).
 *
 * If a ticket for this same order is still open, the message is added to it
 * instead of opening a second one.
 */
export async function contactCustomerAboutOrderAction(
  activationId: string,
  _prev: ContactCustomerResult,
  formData: FormData,
): Promise<ContactCustomerResult> {
  const admin = await requireAdmin();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > 5000) return { error: "Keep it under 5000 characters." };

  const order = await prisma.activation.findUnique({
    where: { id: activationId },
    select: { id: true, userId: true, serviceName: true, user: { select: { email: true, deletedAt: true } } },
  });
  if (!order) return { error: "That order no longer exists." };
  if (order.user.deletedAt) return { error: "That customer's account has been deleted." };

  const existing = await prisma.supportTicket.findFirst({
    where: { userId: order.userId, relatedActivationId: order.id, status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
  });

  const ticket =
    existing ??
    (await prisma.supportTicket.create({
      data: {
        userId: order.userId,
        subject: `About your ${order.serviceName} order`,
        relatedActivationId: order.id,
        status: "PENDING",
      },
    }));

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId: ticket.id, author: "ADMIN", adminEmail: admin.email, body },
    }),
    // Waiting on the customer now.
    prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "PENDING" } }),
  ]);

  await notifyUserOfSupportReply(ticket, body);

  const emailed = await sendEmailSafe({
    to: order.user.email,
    ...renderEmail(
      supportMessageToCustomerEmail({ ticketId: ticket.id, subject: ticket.subject, body }),
    ),
  });

  await recordAudit({
    actor: admin,
    action: "order.contact_customer",
    targetType: "activation",
    targetId: order.id,
    metadata: { ticketId: ticket.id, reusedTicket: Boolean(existing), emailed },
  });

  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath(`/admin/support/${ticket.id}`);
  revalidatePath("/admin/support");
  return { success: true, ticketId: ticket.id, emailed };
}

