"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { sendEmail, EmailDeliveryError } from "@/lib/email";
import { recordAudit } from "@/lib/audit";

export interface ReplyState {
  error?: string;
  success?: boolean;
}

/**
 * An admin's reply: recorded on the ticket thread and emailed to the
 * customer in the same step, so the ticket stays the one place the whole
 * conversation lives even though the customer only ever sees email.
 */
export async function replyToTicketAction(
  ticketId: string,
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const admin = await requireAdmin();

  const body = (formData.get("body") as string)?.trim();
  if (!body) return { error: "Write a reply before sending." };
  if (body.length > 5000) return { error: "Keep it under 5000 characters." };

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { user: { select: { email: true } } },
  });
  if (!ticket) return { error: "That ticket no longer exists." };

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId, author: "ADMIN", adminEmail: admin.email, body },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      // A reply naturally means "waiting on the customer now".
      data: { status: "PENDING" },
    }),
  ]);

  // The customer only ever sees this reply as an email, so a delivery
  // failure is the admin's problem to know about, not something to hide
  // behind a recorded message they will never receive. The message stays on
  // the thread either way; only the reported outcome differs.
  try {
    await sendEmail({
      to: ticket.user.email,
      subject: `Re: ${ticket.subject}`,
      text: body,
      html: `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
    });
  } catch (error) {
    revalidatePath(`/admin/support/${ticketId}`);
    revalidatePath("/admin/support");
    return {
      error:
        error instanceof EmailDeliveryError
          ? `Reply saved to the ticket, but the email was not delivered: ${error.message}`
          : "Reply saved to the ticket, but the email could not be sent.",
    };
  }

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { success: true };
}

export async function setTicketStatusAction(
  ticketId: string,
  status: "OPEN" | "PENDING" | "RESOLVED",
) {
  await requireAdmin();
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
}

/**
 * The only way a manual verification request's status ever changes, and the
 * only path (besides a customer's own token click) that can ever set
 * emailVerified. Both actions here read the request fresh and refuse a
 * request that is no longer PENDING, so double-submitting a click (two open
 * admin tabs, a slow network retry) reviews it at most once.
 */
export async function reviewManualVerificationAction(
  requestId: string,
  decision: "APPROVED" | "REJECTED",
) {
  const admin = await requireAdmin();

  const request = await prisma.manualVerificationRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "PENDING") return;

  if (decision === "APPROVED") {
    // updateMany rather than update: guards the same PENDING race a second
    // time, atomically, without throwing if it's already been reviewed
    // (a plain update() would raise "record not found" against the extra
    // status filter instead of just no-opping).
    const reviewed = await prisma.$transaction(async (tx) => {
      const flipped = await tx.manualVerificationRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: "APPROVED", reviewedBy: admin.email, reviewedAt: new Date() },
      });
      if (flipped.count === 0) return false;

      // Verifies the account and lifts the unverified purchase limit
      // immediately: getUnverifiedDailyPurchaseLimit()'s check in
      // src/app/dashboard/buy/actions.ts reads this same emailVerified
      // field fresh on every purchase attempt.
      await tx.user.update({
        where: { id: request.userId },
        data: { emailVerified: new Date() },
      });
      return true;
    });
    if (!reviewed) return;
  } else {
    const flipped = await prisma.manualVerificationRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "REJECTED", reviewedBy: admin.email, reviewedAt: new Date() },
    });
    if (flipped.count === 0) return;
  }

  await recordAudit({
    actor: { id: admin.id, email: admin.email },
    action: decision === "APPROVED" ? "manual_verification.approved" : "manual_verification.rejected",
    targetType: "user",
    targetId: request.userId,
    metadata: { requestId },
  });

  revalidatePath("/admin/support");
}
