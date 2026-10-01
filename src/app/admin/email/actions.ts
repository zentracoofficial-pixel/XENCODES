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
import { campaignEmail, verificationEmail, type CampaignContent } from "@/lib/email-messages";
import { resendVerificationEmail } from "@/lib/verification";

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
    case "unverified":
      return { kind: "unverified" };
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

export interface SendVerificationRemindersState {
  error?: string;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
}

/**
 * The "Unverified users" audience's send path — deliberately not
 * sendCampaignAction() above. A campaign renders one HTML/text pair once
 * and mails the same copy to everyone; this audience's entire point is the
 * opposite — every recipient needs their own verification token and their
 * own one-account-only link, issued through the exact system that already
 * mints them at signup and from the customer's own "resend" button (see
 * src/lib/verification.ts). There is no separate verification mechanism
 * here: resendVerificationEmail(user), called once per recipient, is the
 * same function and the same branded template either path ends up at.
 *
 * Reusing it also gets three other things for free rather than
 * reimplemented:
 *  - It already refuses a user whose emailVerified became set after they
 *    were counted (resolveAudience() ran once for the whole batch; this
 *    loop re-reads each row immediately before sending), which is exactly
 *    the race the task this function exists for calls out by name.
 *  - It already enforces the same per-account resend cooldown and
 *    hourly cap a customer's own resend button is limited by, so this bulk
 *    operation cannot spam a given inbox (or Xencodes' Resend quota) past
 *    those existing limits.
 *  - That same cooldown is this operation's idempotency guard: clicking
 *    Send twice, or a retried request, finds every recipient still inside
 *    the cooldown the first pass just started and skips them, rather than
 *    a second token and a second email going out.
 */
// Both parameters are unused: there is no form data to read (the audience
// is fixed, not composed), but useActionState still calls this with
// (prevState, formData), so the signature has to accept both.
export async function sendVerificationRemindersAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: SendVerificationRemindersState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<SendVerificationRemindersState> {
  const admin = await requireAdmin();

  if (!isEmailConfigured()) {
    return {
      error:
        "Email is not configured on this deployment: RESEND_API_KEY is not set. Nothing was sent.",
    };
  }

  // The canonical, server-side set, resolved fresh for this send — never
  // the count a possibly-stale admin screen was last showing.
  const recipients = dedupeRecipients(await resolveAudience({ kind: "unverified" }));
  if (recipients.length === 0) {
    return { error: "There are no unverified users right now." };
  }
  if (recipients.length > MAX_CAMPAIGN_RECIPIENTS) {
    return {
      error: `${recipients.length} unverified users, above the ${MAX_CAMPAIGN_RECIPIENTS} limit for one send. Try again once the list is smaller.`,
    };
  }

  // Read once, not hardcoded a second time: this is the exact subject the
  // email that actually goes out will carry, from the one template both
  // signup and the customer's own resend already use.
  const subject = verificationEmail("https://placeholder.invalid/").subject;

  const campaign = await prisma.emailCampaign.create({
    data: {
      adminId: admin.id,
      adminEmail: admin.email,
      subject,
      audienceLabel: describeAudience({ kind: "unverified" }),
      audienceFilter: { kind: "unverified" },
      recipientCount: recipients.length,
      status: "SENDING",
    },
  });

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let firstFailure: string | null = null;

  for (const recipient of recipients) {
    // Re-fetched fresh, immediately before this exact send: a batch of any
    // real size takes long enough for an account to verify or get deleted
    // partway through, and neither should still receive a verification
    // email by the time this specific iteration runs, whatever
    // resolveAudience() found when the batch started. Suspension is
    // deliberately not re-checked here, matching resolveAudience()'s own
    // LIVE_USER filter (shared by every other audience, none of which
    // exclude suspended accounts either) — a suspended account can still be
    // legitimately verified later (see adminVerifyUserEmail(), which does
    // not check suspension either), and excluding it here only at send time
    // would silently send fewer emails than the recipient count the admin
    // was already shown.
    const user = await prisma.user.findUnique({ where: { id: recipient.id } });
    if (!user || user.deletedAt) {
      skippedCount += 1;
      continue;
    }

    const result = await resendVerificationEmail(user);
    switch (result.status) {
      case "sent":
        sentCount += 1;
        break;
      case "already_verified":
      case "cooling_down":
      case "limit_reached":
        // Deliberately not a failure: the account either no longer needs
        // this email, or already has one on the way / already received the
        // maximum this hour — see this function's own comment on why that
        // cooldown is also this operation's idempotency guard.
        skippedCount += 1;
        break;
      case "not_authenticated":
        // Unreachable in practice: resendVerificationEmail() only returns
        // this for a missing user, and `user` above is always a real row.
        skippedCount += 1;
        break;
      case "provider_error":
        failedCount += 1;
        firstFailure ??= result.message;
        console.error(
          `[email-verification-reminders] failed to send to user ${user.id}: ${result.message}`,
        );
        break;
    }
  }

  // FAILED only when every attempt actually failed outright; a run that
  // skipped everyone (nobody left who still needed one) is not a failure of
  // this operation, just nothing to do — still recorded as SENT with 0 sent.
  const status = sentCount === 0 && failedCount > 0 ? "FAILED" : "SENT";

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { status, sentCount, failedCount, skippedCount, failureReason: firstFailure, sentAt: new Date() },
  });

  await recordAudit({
    actor: admin,
    action: "email.send_verification_reminders",
    targetType: "email_campaign",
    targetId: campaign.id,
    metadata: {
      recipientCount: recipients.length,
      sentCount,
      failedCount,
      skippedCount,
      failureReason: firstFailure,
    },
  });

  if (sentCount === 0 && failedCount > 0) {
    return {
      error: `Nothing was delivered to any of the ${recipients.length} unverified users. ${
        firstFailure ?? "The mail provider rejected every message."
      }`,
      sentCount,
      failedCount,
      skippedCount,
    };
  }

  return { success: true, sentCount, failedCount, skippedCount };
}
