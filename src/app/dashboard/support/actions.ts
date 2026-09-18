"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
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

  await sendEmail({
    to: SUPPORT_INBOX,
    subject: `Activation issue: ${activation.serviceName} (${activation.id})`,
    text: summary,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${summary
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</pre>`,
  });

  return { success: true };
}
