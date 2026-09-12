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
 * Sends an activation problem to the support inbox. Deliberately not a ticket
 * system: at this stage a clear email with the activation attached is enough.
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

  const summary = [
    `Customer: ${session.user.email}`,
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
