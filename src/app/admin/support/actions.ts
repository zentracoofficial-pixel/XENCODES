"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

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

  await sendEmail({
    to: ticket.user.email,
    subject: `Re: ${ticket.subject}`,
    text: body,
    html: `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`,
  });

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
