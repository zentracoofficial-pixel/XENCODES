"use server";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { sendEmail, isEmailConfigured, EmailDeliveryError } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import {
  resolveAudience,
  describeAudience,
  type AudienceSegment,
} from "@/lib/email-targeting";
import { renderEmail } from "@/lib/email-template";
import { campaignEmail, type CampaignContent } from "@/lib/email-messages";

/**
 * A send this large would risk running past a serverless function's time
 * limit and would be sent to more people than an early-stage product's
 * audience realistically is in one go. An admin who needs to reach more
 * than this splits it into narrower segments rather than this silently
 * timing out partway through a send.
 */
const MAX_CAMPAIGN_RECIPIENTS = 500;

export type ComposedEmail = Required<CampaignContent>;

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

/** Checked before a test or a real send, so a button that would be dropped
 *  (half filled in, or not an https link) is an error the admin sees rather
 *  than something that silently vanishes from every recipient's copy. */
function composedError(composed: ComposedEmail): string | null {
  if (!composed.subject || !composed.title || !composed.body) {
    return "Fill in subject, title and body.";
  }
  if (Boolean(composed.ctaText) !== Boolean(composed.ctaUrl)) {
    return "Fill in both the button text and the button URL, or leave both empty.";
  }
  if (composed.ctaUrl) {
    let url: URL | null = null;
    try {
      url = new URL(composed.ctaUrl);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:") {
      return "The button URL must be a full https:// link.";
    }
  }
  return null;
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

/**
 * One entry per person, whatever the segment returned.
 *
 * A segment can name the same account twice (the same id picked more than
 * once in "selected users"), and two accounts can in principle carry the
 * same address. Collapsing on both is what stops one person receiving the
 * same campaign twice, and it happens here rather than at send time so the
 * count an admin is shown before sending is the same number of messages
 * that actually go out.
 */
function dedupeRecipients(
  recipients: { id: string; email: string }[],
): { id: string; email: string }[] {
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const unique: { id: string; email: string }[] = [];

  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();
    if (!email || seenIds.has(recipient.id) || seenEmails.has(email)) continue;
    seenIds.add(recipient.id);
    seenEmails.add(email);
    unique.push(recipient);
  }

  return unique;
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
  const recipients = dedupeRecipients(await resolveAudience(segment));
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
  const testError = composedError(composed);
  if (testError) return { error: testError };

  // A test exists to prove delivery works before a real audience is
  // involved, so its reported outcome has to be the provider's, not this
  // function's optimism about it.
  try {
    const { html, text } = renderEmail(campaignEmail(composed));
    await sendEmail({ to: admin.email, subject: `[Test] ${composed.subject}`, html, text });
  } catch (error) {
    return {
      error:
        error instanceof EmailDeliveryError
          ? `Test not delivered: ${error.message}`
          : "Test not delivered: unexpected error while sending.",
    };
  }

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
  const sendError = composedError(composed);
  if (sendError) return { error: sendError };

  // Checked before anything is recorded: a deployment with no mail
  // credentials can only produce a campaign row that failed on every
  // recipient, and saying so up front is more useful than writing that row
  // and letting the admin discover it in the history.
  if (!isEmailConfigured()) {
    return {
      error:
        "Email is not configured on this deployment: RESEND_API_KEY is not set. Nothing was sent.",
    };
  }

  const segment = parseSegment(formData);
  const recipients = dedupeRecipients(await resolveAudience(segment));

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

  const { html, text } = renderEmail(campaignEmail(composed));

  let sentCount = 0;
  let failedCount = 0;
  // The first real reason, kept for the history row. One cause (a domain
  // that is not verified, a missing key) explains the whole run, so the
  // first is representative; logging keeps the rest recoverable.
  let firstFailure: string | null = null;

  for (const recipient of recipients) {
    try {
      await sendEmail({ to: recipient.email, subject: composed.subject, html, text });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      const reason =
        error instanceof EmailDeliveryError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown sending error.";
      firstFailure ??= reason;
      console.error(`[email-campaign] failed to send to ${recipient.email}:`, reason);
    }
  }

  // Three outcomes, not two. A run where nothing went out is FAILED; a run
  // where some did is SENT but keeps its failed count and the reason, so a
  // partial delivery is never presented as a clean one.
  const status = sentCount === 0 ? "FAILED" : "SENT";

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      status,
      sentCount,
      failedCount,
      failureReason: firstFailure,
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
      failureReason: firstFailure,
    },
  });

  if (sentCount === 0) {
    return {
      error: `Nothing was delivered to any of the ${recipients.length} recipients. ${
        firstFailure ?? "The mail provider rejected every message."
      }`,
      sentCount,
      failedCount,
    };
  }

  return { success: true, sentCount, failedCount };
}
