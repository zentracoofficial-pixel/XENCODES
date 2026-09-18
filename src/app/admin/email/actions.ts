"use server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import {
  resolveAudience,
  describeAudience,
  type AudienceSegment,
} from "@/lib/email-targeting";
import { buildCampaignEmailHtml, buildCampaignEmailText } from "@/lib/email-template";

/**
 * A send this large would risk running past a serverless function's time
 * limit and would be sent to more people than an early-stage product's
 * audience realistically is in one go. An admin who needs to reach more
 * than this splits it into narrower segments rather than this silently
 * timing out partway through a send.
 */
const MAX_CAMPAIGN_RECIPIENTS = 500;

export interface ComposedEmail {
  title: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  subject: string;
  previewText: string;
}

function parseSegment(formData: FormData): AudienceSegment {
  const kind = String(formData.get("segmentKind") ?? "all") as AudienceSegment["kind"];
  switch (kind) {
    case "purchased_recently":
    case "not_purchased_recently":
      return { kind, days: Number(formData.get("days")) || 30 };
    case "low_balance":
      return {
        kind,
        thresholdKobo: Math.round((Number(formData.get("thresholdNaira")) || 0) * 100),
      };
    case "inactive_login":
      return { kind, days: Number(formData.get("days")) || 30 };
    case "selected":
      return {
        kind,
        userIds: String(formData.get("userIds") ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      };
    case "specific_user":
      return { kind, userId: String(formData.get("userId") ?? "") };
    default:
      return { kind: "all" };
  }
}

function composedFromForm(formData: FormData): ComposedEmail {
  return {
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    ctaText: String(formData.get("ctaText") ?? "").trim(),
    ctaUrl: String(formData.get("ctaUrl") ?? "").trim(),
    subject: String(formData.get("subject") ?? "").trim(),
    previewText: String(formData.get("previewText") ?? "").trim(),
  };
}

export interface RecipientCountResult {
  count: number;
  label: string;
}

export async function getRecipientCountAction(
  formData: FormData,
): Promise<RecipientCountResult> {
  await requireAdmin();
  const segment = parseSegment(formData);
  const recipients = await resolveAudience(segment);
  return { count: recipients.length, label: describeAudience(segment) };
}

/** Also used to search for "selected users" / "specific user" targeting,
 *  reusing the same search the rest of the admin panel already has. */
export async function searchUsersAction(
  query: string,
): Promise<{ id: string; email: string }[]> {
  await requireAdmin();
  const q = query.trim();
  if (!q) return [];
  return prisma.user.findMany({
    where: { email: { contains: q, mode: "insensitive" }, deletedAt: null, role: "USER" },
    select: { id: true, email: true },
    take: 10,
  });
}

export interface SendTestState {
  error?: string;
  success?: boolean;
}

export async function sendTestEmailAction(
  _prev: SendTestState,
  formData: FormData,
): Promise<SendTestState> {
  const admin = await requireAdmin();
  const composed = composedFromForm(formData);
  if (!composed.subject || !composed.title || !composed.body) {
    return { error: "Fill in subject, title and body before sending a test." };
  }

  await sendEmail({
    to: admin.email,
    subject: `[Test] ${composed.subject}`,
    html: buildCampaignEmailHtml(composed),
    text: buildCampaignEmailText(composed),
  });

  return { success: true };
}

export interface SendCampaignState {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
}

export async function sendCampaignAction(
  _prev: SendCampaignState,
  formData: FormData,
): Promise<SendCampaignState> {
  const admin = await requireAdmin();
  const composed = composedFromForm(formData);
  if (!composed.subject || !composed.title || !composed.body) {
    return { error: "Fill in subject, title and body before sending." };
  }

  const segment = parseSegment(formData);
  const recipients = await resolveAudience(segment);

  if (recipients.length === 0) {
    return { error: "That audience has no one in it right now." };
  }
  if (recipients.length > MAX_CAMPAIGN_RECIPIENTS) {
    return {
      error: `That audience has ${recipients.length} people, above the ${MAX_CAMPAIGN_RECIPIENTS} limit for one send. Narrow the targeting and try again.`,
    };
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      adminId: admin.id,
      adminEmail: admin.email,
      subject: composed.subject,
      previewText: composed.previewText || null,
      audienceLabel: describeAudience(segment),
      audienceFilter: segment,
      recipientCount: recipients.length,
      status: "SENDING",
    },
  });

  const html = buildCampaignEmailHtml(composed);
  const text = buildCampaignEmailText(composed);

  let sentCount = 0;
  let failedCount = 0;
  for (const recipient of recipients) {
    try {
      await sendEmail({ to: recipient.email, subject: composed.subject, html, text });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(`[email-campaign] failed to send to ${recipient.email}:`, error);
    }
  }

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      status: failedCount === 0 ? "SENT" : sentCount > 0 ? "SENT" : "FAILED",
      sentCount,
      failedCount,
      sentAt: new Date(),
    },
  });

  await recordAudit({
    actor: admin,
    action: "email.send",
    targetType: "email_campaign",
    targetId: campaign.id,
    metadata: {
      subject: composed.subject,
      audience: describeAudience(segment),
      recipientCount: recipients.length,
      sentCount,
      failedCount,
    },
  });

  return { success: true, sentCount, failedCount };
}
