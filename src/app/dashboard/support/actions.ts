"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailSafe } from "@/lib/email";
import { formatNaira } from "@/lib/currency";

export interface ReportState {
  error?: string;
  success?: boolean;
}

const SUPPORT_INBOX = process.env.SUPPORT_EMAIL ?? "support@xencodes.com";

/**
 * Turns an activation problem into a support ticket the admin panel can
 * actually track (open, reply, resolve), and also emails the support inbox
 * so nothing depends on someone remembering to check the admin panel.
 */
export async function reportIssueAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Log in to report an issue." };

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
    where: { id: activationId, userId: session.user.id },
  });
  if (!activation) return { error: "We could not find that activation." };

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: session.user.id,
      subject: `Activation issue: ${activation.serviceName}`,
      relatedActivationId: activation.id,
      messages: { create: { author: "USER", body: details } },
    },
  });

  const summary = [
    `Customer: ${session.user.email}`,
    `Ticket: ${ticket.id}`,
    `Activation: ${activation.id}`,
    `Service: ${activation.serviceName}`,
    `Country: ${activation.countryName}`,
    `Number: ${activation.phoneNumber}`,
    `Status: ${activation.status}`,
    `Price: ${formatNaira(activation.priceKobo)}`,
    `Bought: ${activation.createdAt.toISOString()}`,
    "",
    details,
  ].join("\n");

  // Non-throwing: the ticket is already recorded and visible in the admin
  // panel, which is the system of record. This email is a nudge on top of
  // it, so failing to send one must not tell the customer their report did
  // not go through.
  await sendEmailSafe({
    to: SUPPORT_INBOX,
    subject: `Activation issue: ${activation.serviceName} (${activation.id})`,
    text: summary,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${summary
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`,
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
  const session = await auth();
  if (!session?.user?.id) return { error: "Log in to contact support." };

  const subject = String(formData.get("subject") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();

  if (subject.length < 3) return { error: "Give it a short subject." };
  if (subject.length > 200) return { error: "Keep the subject under 200 characters." };
  if (details.length < 10) return { error: "Add a little more detail so we can help." };
  if (details.length > 2000) return { error: "That is too long. Keep it under 2000 characters." };

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: session.user.id,
      subject,
      messages: { create: { author: "USER", body: details } },
    },
  });

  await sendEmailSafe({
    to: SUPPORT_INBOX,
    subject: `Support request: ${subject} (${ticket.id})`,
    text: `Customer: ${session.user.email}\nTicket: ${ticket.id}\n\n${details}`,
    html: `<p><strong>Customer:</strong> ${session.user.email}<br><strong>Ticket:</strong> ${ticket.id}</p><pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${details
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`,
  });

  revalidatePath("/dashboard/support");
  redirect(`/dashboard/support/${ticket.id}`);
}

export interface ReplyState {
  error?: string;
}

/**
 * A customer's own reply on an existing ticket, the other half of the
 * thread admin already replies to from src/app/admin/support/[id]. Scoped
 * to the signed-in customer's own ticket by the query itself, so one
 * customer cannot post into another's thread by guessing an id.
 *
 * A reply naturally means "waiting on us again", the same reasoning
 * replyToTicketAction on the admin side uses for the opposite direction:
 * moves the ticket back to OPEN rather than leaving it RESOLVED while a
 * customer is actively still talking.
 */
export async function replyToTicketAsUserAction(
  ticketId: string,
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Log in to reply." };

  const body = (formData.get("body") as string)?.trim();
  if (!body) return { error: "Write a message before sending." };
  if (body.length > 2000) return { error: "Keep it under 2000 characters." };

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId: session.user.id },
  });
  if (!ticket) return { error: "That ticket no longer exists." };

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId, author: "USER", body },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: "OPEN" },
    }),
  ]);

  await sendEmailSafe({
    to: SUPPORT_INBOX,
    subject: `Re: ${ticket.subject} (${ticket.id})`,
    text: `Customer: ${session.user.email}\n\n${body}`,
    html: `<p><strong>Customer:</strong> ${session.user.email}</p><pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`,
  });

  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  return {};
}
