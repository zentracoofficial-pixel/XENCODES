import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { EmailMessage } from "@/lib/email-template";

/**
 * The content of every email Xencodes sends, as data. How it looks is
 * entirely src/lib/email-template.ts's job; nothing here writes markup.
 */

const SUPPORT_INBOX_NOTE = `You received this email because this address is the ${SITE_NAME} support inbox.`;
const ADMIN_ALERT_NOTE = `You received this alert because this address is the ${SITE_NAME} admin contact.`;

export function verificationEmail(verifyUrl: string): EmailMessage {
  return {
    subject: "Verify your Xencodes email address",
    title: "Verify your email address",
    previewText: "Confirm your email address to finish setting up your Xencodes account.",
    blocks: [
      {
        type: "text",
        text: "Thanks for creating a Xencodes account. Confirm that this is your email address to finish setting up your account and unlock full access, including higher purchase limits.",
      },
      { type: "button", text: "Verify my email", url: verifyUrl },
      { type: "fallbackLink", url: verifyUrl },
      {
        type: "note",
        text: "This link expires in 24 hours. If you didn't create a Xencodes account, you can safely ignore this email.",
      },
    ],
  };
}

export function passwordResetEmail(resetUrl: string): EmailMessage {
  return {
    subject: "Reset your Xencodes password",
    title: "Reset your password",
    previewText: "Use this link to choose a new password for your Xencodes account.",
    blocks: [
      {
        type: "text",
        text: "We received a request to reset the password for your Xencodes account. Use the button below to choose a new one.",
      },
      { type: "button", text: "Reset my password", url: resetUrl },
      { type: "fallbackLink", url: resetUrl },
      {
        type: "note",
        text: "This link expires in 1 hour and can only be used once. If you didn't request a password reset, you can ignore this email; your password won't change.",
      },
    ],
  };
}

/** What an admin fills in on /admin/email. The body is plain text with the
 *  small formatting subset email-format.ts understands. */
export interface CampaignContent {
  subject: string;
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  previewText?: string;
}

export function campaignEmail(content: CampaignContent): EmailMessage {
  return {
    subject: content.subject,
    title: content.title,
    previewText: content.previewText || undefined,
    blocks: [
      { type: "text", text: content.body },
      ...(content.ctaText && content.ctaUrl
        ? [{ type: "button" as const, text: content.ctaText, url: content.ctaUrl }]
        : []),
    ],
  };
}

function adminTicketUrl(ticketId: string): string {
  return `${SITE_URL}/admin/support/${ticketId}`;
}

export function activationIssueEmail(input: {
  customerEmail: string;
  ticketId: string;
  activationId: string;
  serviceName: string;
  countryName: string;
  phoneNumber: string;
  status: string;
  price: string;
  boughtAt: Date;
  details: string;
}): EmailMessage {
  return {
    subject: `Activation issue: ${input.serviceName} (${input.activationId})`,
    title: "Activation issue reported",
    previewText: `${input.customerEmail} reported a problem with a ${input.serviceName} number.`,
    footerNote: SUPPORT_INBOX_NOTE,
    blocks: [
      { type: "text", text: `${input.customerEmail} reported a problem with an activation.` },
      {
        type: "details",
        rows: [
          { label: "Customer", value: input.customerEmail },
          { label: "Ticket", value: input.ticketId },
          { label: "Activation", value: input.activationId },
          { label: "Service", value: input.serviceName },
          { label: "Country", value: input.countryName },
          { label: "Number", value: input.phoneNumber },
          { label: "Status", value: input.status },
          { label: "Price", value: input.price },
          { label: "Bought", value: `${input.boughtAt.toISOString().replace("T", " ").slice(0, 16)} UTC` },
        ],
      },
      { type: "quote", text: input.details },
      { type: "button", text: "Open ticket", url: adminTicketUrl(input.ticketId) },
    ],
  };
}

export function supportRequestEmail(input: {
  customerEmail: string;
  ticketId: string;
  subject: string;
  details: string;
}): EmailMessage {
  return {
    subject: `Support request: ${input.subject} (${input.ticketId})`,
    title: "New support request",
    previewText: `${input.customerEmail}: ${input.subject}`,
    footerNote: SUPPORT_INBOX_NOTE,
    blocks: [
      {
        type: "details",
        rows: [
          { label: "Customer", value: input.customerEmail },
          { label: "Ticket", value: input.ticketId },
          { label: "Subject", value: input.subject },
        ],
      },
      { type: "quote", text: input.details },
      { type: "button", text: "Open ticket", url: adminTicketUrl(input.ticketId) },
    ],
  };
}

export function supportReplyEmail(input: {
  customerEmail: string;
  ticketId: string;
  subject: string;
  body: string;
}): EmailMessage {
  return {
    subject: `Re: ${input.subject} (${input.ticketId})`,
    title: "Customer replied to a ticket",
    previewText: `${input.customerEmail} replied on "${input.subject}".`,
    footerNote: SUPPORT_INBOX_NOTE,
    blocks: [
      {
        type: "details",
        rows: [
          { label: "Customer", value: input.customerEmail },
          { label: "Ticket", value: input.ticketId },
          { label: "Subject", value: input.subject },
        ],
      },
      { type: "quote", text: input.body },
      { type: "button", text: "Open ticket", url: adminTicketUrl(input.ticketId) },
    ],
  };
}

export function emailSettingsTestEmail(input: { fromAddress: string; sentAt: Date }): EmailMessage {
  return {
    subject: "Xencodes test email",
    title: "Outbound email is working",
    previewText: "A test message from the Xencodes admin panel.",
    footerNote: `You received this test because an admin sent it from the ${SITE_NAME} admin panel.`,
    blocks: [
      {
        type: "text",
        text: "This is a test email sent from the Xencodes admin panel. If you're reading it, outbound email is configured correctly.",
      },
      {
        type: "details",
        rows: [
          { label: "Sent as", value: input.fromAddress },
          { label: "Sent at", value: input.sentAt.toISOString() },
        ],
      },
    ],
  };
}

export function providerLowBalanceEmail(input: {
  label: string;
  balance: string;
  threshold: string;
  detectedAt: Date;
  isFirstAlert: boolean;
}): EmailMessage {
  const detected = `${input.detectedAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
  const message = `${input.label} balance is low. Current provider credit: ${input.balance}. Please top up the provider account.`;

  return {
    subject: input.isFirstAlert
      ? `Xencodes Alert: ${input.label} balance is low`
      : `Xencodes Reminder: ${input.label} balance is still low`,
    title: input.isFirstAlert ? `${input.label} balance is low` : `${input.label} balance is still low`,
    previewText: message,
    footerNote: ADMIN_ALERT_NOTE,
    blocks: [
      { type: "text", text: message },
      {
        type: "details",
        rows: [
          { label: "Provider", value: input.label },
          { label: "Current balance", value: input.balance },
          { label: "Threshold", value: input.threshold },
          { label: "Detected", value: detected },
        ],
      },
      {
        type: "text",
        text: input.isFirstAlert
          ? "This is the supplier account balance Xencodes pays to buy numbers from. It is separate from customer wallets, which are unaffected."
          : "This is a reminder that the balance is still at or below the threshold, not a new, unrelated alert. Number purchases will start failing once the provider account runs out of credit.",
      },
      { type: "text", text: `**Recommended action:** top up the ${input.label} account balance as soon as possible.` },
      { type: "button", text: "View in admin dashboard", url: `${SITE_URL}/admin` },
    ],
  };
}
