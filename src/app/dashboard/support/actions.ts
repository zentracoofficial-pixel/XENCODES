"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendEmailSafe } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { activationIssueEmail, supportRequestEmail } from "@/lib/email-messages";
import { formatMoney } from "@/lib/currency";
import { notifyAdminsOfSupportMessage } from "@/lib/notifications";
import { SUPPORT_EMAIL as SUPPORT_INBOX } from "@/lib/site";
import { readAttachmentFromForm } from "@/lib/support-attachments";

export interface ReportState {
  error?: string;
  success?: boolean;
}

/**
 * Turns an activation problem into a support ticket the admin panel can
 * actually track (open, reply, resolve), and also emails the support inbox
 * so nothing depends on someone remembering to check the admin panel.
 */
export async function reportIssueAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const user = await getActiveUser();
  if (!user) return { error: "Log in to report an issue." };

  const activationId = String(formData.get("activationId") ?? "");
  const details = String(formData.get("details") ?? "").trim();

  if (!activationId) return { error: "Choose which activation had the problem." };
  if (details.length < 10) {
    return { error: "Add a little more detail so we can help." };
  }
  if (details.length > 2000) {
    return { error: "That is too long. Keep it under 2000 characters." };
  }

  const activation = await prisma.activation.findFirst({
    where: { id: activationId, userId: user.id },
  });
  if (!activation) return { error: "We could not find that activation." };

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      subject: `Activation issue: ${activation.serviceName}`,
      relatedActivationId: activation.id,
      messages: { create: { author: "USER", body: details } },
    },
  });

  await notifyAdminsOfSupportMessage(ticket, user, details);

  // Non-throwing: the ticket is already recorded and visible in the admin
  // panel, which is the system of record. This email is a nudge on top of
  // it, so failing to send one must not tell the customer their report did
  // not go through.
  await sendEmailSafe({
    to: SUPPORT_INBOX,
    ...renderEmail(
      activationIssueEmail({
        customerEmail: user.email,
        ticketId: ticket.id,
        activationId: activation.id,
        serviceName: activation.serviceName,
        countryName: activation.countryName,
        phoneNumber: activation.phoneNumber,
        status: activation.status,
        price: formatMoney(activation.priceKobo, activation.currency),
        boughtAt: activation.createdAt,
        details,
      }),
    ),
  });

  return { success: true };
}

/**
 * A support request not tied to any specific activation, for everything
 * report-an-activation-issue above cannot cover: a wallet question, a
 * billing dispute, or anything else. Goes through the same SupportTicket
 * model, so the admin panel's queue is one place, not two.
 */
export async function createGeneralTicketAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const user = await getActiveUser();
  if (!user) return { error: "Log in to contact support." };

  const subject = String(formData.get("subject") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();

  if (subject.length < 3) return { error: "Give it a short subject." };
  if (subject.length > 200) return { error: "Keep the subject under 200 characters." };
  if (details.length < 10) return { error: "Add a little more detail so we can help." };
  if (details.length > 2000) return { error: "That is too long. Keep it under 2000 characters." };

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      subject,
      messages: { create: { author: "USER", body: details } },
    },
  });

  await notifyAdminsOfSupportMessage(ticket, user, details);

  await sendEmailSafe({
    to: SUPPORT_INBOX,
    ...renderEmail(
      supportRequestEmail({ customerEmail: user.email, ticketId: ticket.id, subject, details }),
    ),
  });

  revalidatePath("/dashboard/support");
  redirect(`/dashboard/support/${ticket.id}`);
}

export interface ReplyState {
  error?: string;
  /** Bumped on every successful send, so the form can clear itself. */
  sent?: number;
}

/**
 * A customer's own reply on an existing ticket, the other half of the
 * thread admin already replies to from src/app/admin/support/[id]. Scoped
 * to the signed-in customer's own ticket by the query itself, so one
 * customer cannot post into another's thread by guessing an id.
 *
 * A reply means "waiting on us again": it moves the ticket back to OPEN. A
 * closed ticket takes no reply (its files are already deleted): the customer
 * opens a new ticket instead.
 */
export async function replyToTicketAsUserAction(
  ticketId: string,
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const user = await getActiveUser();
  if (!user) return { error: "Log in to reply." };

  const body = ((formData.get("body") as string) ?? "").trim();
  if (body.length > 2000) return { error: "Keep it under 2000 characters." };
  const parsed = await readAttachmentFromForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const attachment = parsed.attachment;
  if (!body && !attachment) return { error: "Write a message or attach a file before sending." };

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId: user.id },
  });
  if (!ticket) return { error: "That ticket no longer exists." };
  if (ticket.status === "RESOLVED") {
    return { error: "This ticket is closed. Start a new ticket if you still need help." };
  }

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId,
        author: "USER",
        body,
        ...(attachment ? { attachments: { create: attachment } } : {}),
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: "OPEN" },
    }),
  ]);

  // What the notification and email say: the text, and the file's name when there is one.
  const summary = [body, attachment ? `[Attached file: ${attachment.fileName}]` : ""].filter(Boolean).join("\n\n");
  // In-dashboard notification only. The support inbox is emailed once, when
  // the ticket is opened; later messages on the same ticket are not emailed,
  // so one conversation never fills the inbox.
  await notifyAdminsOfSupportMessage(ticket, user, summary);

  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  return { sent: Date.now() };
}
