import { Resend } from "resend";
import { buildCampaignEmailHtml, buildCampaignEmailText } from "@/lib/email-template";

/**
 * Outbound email, through Resend.
 *
 * The rule this file exists to enforce: a send either provably reached the
 * provider, or it throws. There is no third outcome. An earlier version
 * returned normally when RESEND_API_KEY was unset and ignored the error
 * field Resend returns on a rejected send, so a campaign could report
 * "sent to 40 people" having delivered nothing at all. Every reported
 * success now corresponds to a provider response that actually accepted
 * the message.
 */

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM ?? "Xencodes <onboarding@resend.dev>";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "rejected" | "network" = "rejected",
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

/** Whether this deployment can actually send. Checked before a campaign is
 *  recorded, so an unconfigured deployment refuses up front instead of
 *  writing a campaign row that could only ever fail. */
export function isEmailConfigured(): boolean {
  return resend !== null;
}

/** The address emails are sent from, for display in the admin panel. */
export function emailFromAddress(): string {
  return emailFrom;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends one email. Throws on anything that is not a confirmed acceptance by
 * Resend, including the case where no API key is configured.
 *
 * Resend's SDK reports a rejected send by returning `{ data: null, error }`
 * rather than by throwing, so the error field is the thing that actually
 * has to be checked; awaiting the call and moving on is exactly how a
 * failed send gets counted as a successful one.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  if (!resend) {
    throw new EmailDeliveryError(
      "RESEND_API_KEY is not set as an environment variable on this deployment.",
      "not_configured",
    );
  }

  let result: Awaited<ReturnType<typeof resend.emails.send>>;
  try {
    result = await resend.emails.send({ from: emailFrom, to, subject, html, text });
  } catch (error) {
    throw new EmailDeliveryError(
      `Could not reach Resend: ${error instanceof Error ? error.message : "network error"}`,
      "network",
    );
  }

  if (result.error) {
    throw new EmailDeliveryError(
      result.error.message || "Resend rejected the message without giving a reason.",
      "rejected",
    );
  }
}

/**
 * For transactional email attached to an action that must still succeed if
 * the message cannot be delivered: a verification email failing should not
 * undo an account that was already created, nor surface a provider error to
 * someone who just filled in a signup form.
 *
 * Returns whether it sent, and logs the reason when it did not, so a
 * misconfigured deployment is visible in the function logs rather than
 * silently swallowed. Never use this for an admin campaign: there the
 * whole point is that the recorded outcome is the real one.
 */
export async function sendEmailSafe(input: SendEmailInput): Promise<boolean> {
  try {
    await sendEmail(input);
    return true;
  } catch (error) {
    console.error(
      `[email] failed to send "${input.subject}" to ${input.to}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * Through the same branded shell every admin campaign renders through (see
 * buildCampaignEmailHtml in src/lib/email-template.ts), not a bespoke plain
 * one: a customer's first email from Xencodes should look like it came from
 * the same product as the site, logo and all.
 */
export function verificationEmailContent(verifyUrl: string) {
  const input = {
    title: "Verify your email address",
    body: [
      "Thanks for creating a Xencodes account. Confirm this is really your email address to unlock full account access, including higher purchase limits.",
      "If the button above doesn't work, copy and paste this link into your browser:",
      verifyUrl,
      "This link expires in 24 hours. If you didn't create a Xencodes account, you can safely ignore this email.",
    ].join("\n\n"),
    ctaText: "Verify my email",
    ctaUrl: verifyUrl,
    previewText: "Confirm your email address to finish setting up your Xencodes account.",
  };

  return {
    subject: "Verify your Xencodes email address",
    text: buildCampaignEmailText(input),
    html: buildCampaignEmailHtml(input),
  };
}

export function passwordResetEmailContent(resetUrl: string) {
  return {
    subject: "Reset your Xencodes password",
    text: `Reset your password by visiting this link: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: `<p>We received a request to reset your Xencodes password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  };
}
