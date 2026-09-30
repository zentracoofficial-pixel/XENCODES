"use server";

import { requireAdmin } from "@/lib/admin";
import { renderEmailHtml } from "@/lib/email-template";
import {
  renderRecoveryEmailPreview,
  sendManualRecoveryEmail,
  setRecoveryStatus,
} from "@/lib/recovery";

export interface RecoveryPreviewState {
  error?: string;
  subject?: string;
  bodyText?: string;
  html?: string;
}

/** Renders the admin's typed subject/body against this exact customer's
 *  real data — never sent from here, only shown back for review. */
export async function previewRecoveryEmailAction(
  userId: string,
  subjectTemplate: string,
  bodyTemplate: string,
): Promise<RecoveryPreviewState> {
  await requireAdmin();
  if (!subjectTemplate.trim() || !bodyTemplate.trim()) {
    return { error: "Fill in both the subject and the message." };
  }

  const rendered = await renderRecoveryEmailPreview(userId, subjectTemplate, bodyTemplate);
  if (!rendered) return { error: "No recovery record found for this customer." };

  return {
    subject: rendered.subject,
    bodyText: rendered.bodyText,
    html: renderEmailHtml(rendered.message),
  };
}

export interface SendRecoveryState {
  error?: string;
  success?: boolean;
}

/** The only function that actually sends — only reachable after the admin
 *  has previewed the exact same render (the composer only shows this
 *  button once a preview has been requested for the current text). */
export async function sendRecoveryEmailAction(
  userId: string,
  subjectTemplate: string,
  bodyTemplate: string,
): Promise<SendRecoveryState> {
  const admin = await requireAdmin();
  if (!subjectTemplate.trim() || !bodyTemplate.trim()) {
    return { error: "Fill in both the subject and the message." };
  }

  const result = await sendManualRecoveryEmail({
    userId,
    subjectTemplate,
    bodyTemplate,
    admin: { id: admin.id, email: admin.email },
  });

  if (!result.ok) {
    return { error: result.error ?? "The message was not delivered." };
  }
  return { success: true };
}

export async function resolveRecoveryAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  await setRecoveryStatus(userId, "RESOLVED", { id: admin.id, email: admin.email });
}

export async function dismissRecoveryAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  await setRecoveryStatus(userId, "DISMISSED", { id: admin.id, email: admin.email });
}
