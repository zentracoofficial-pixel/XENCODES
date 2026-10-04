"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { writeSetting, SETTING_KEYS } from "@/lib/settings";
import { ANNOUNCEMENT_MESSAGE_MAX, ANNOUNCEMENT_TITLE_MAX } from "@/lib/announcement-limits";
import { MAX_MARGIN_PERCENT } from "@/lib/pricing";
import { recordAudit } from "@/lib/audit";
import { sendEmail, EmailDeliveryError, emailFromAddress } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { emailSettingsTestEmail } from "@/lib/email-messages";

function refresh() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/providers");
  revalidatePath("/admin/services");
  revalidatePath("/admin");
  revalidatePath("/buy");
  revalidatePath("/dashboard/buy");
}

export interface SettingsState {
  error?: string;
  success?: boolean;
}

/**
 * The two margins every price falls back to.
 *
 * Validated to a sane band rather than accepted blindly: a margin at or
 * above 100% is a division by zero, and a negative one sells below cost,
 * which is the exact outcome the pricing engine exists to prevent.
 */
export async function saveMarginSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const defaultPercent = Number(formData.get("defaultMargin"));
  const exclusivePercent = Number(formData.get("exclusiveMargin"));

  for (const value of [defaultPercent, exclusivePercent]) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_MARGIN_PERCENT) {
      return {
        error: `Enter whole percents between 0 and ${MAX_MARGIN_PERCENT}.`,
      };
    }
  }

  await Promise.all([
    writeSetting(SETTING_KEYS.defaultGrossMarginPercent, String(defaultPercent)),
    writeSetting(
      SETTING_KEYS.exclusiveGrossMarginPercent,
      String(exclusivePercent),
    ),
  ]);
  await recordAudit({
    actor: admin,
    action: "settings.update",
    targetType: "settings",
    targetId: "margins",
    metadata: { defaultPercent, exclusivePercent },
  });

  refresh();
  return { success: true };
}

/**
 * The processing fee percentage passed on to customers at wallet top-up, so
 * KoraPay's cut is not silently absorbed by the business. KoraPay's own
 * published rate is one number regardless of currency, so this stays a
 * single platform-wide setting; the fee's cap, unlike the percentage, does
 * vary sensibly by currency and is set per-currency on /admin/currencies
 * instead, not here.
 */
export async function saveTopupFeeSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const feePercent = Number(formData.get("feePercent"));

  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 20) {
    return { error: "Enter a fee percentage between 0 and 20." };
  }

  await writeSetting(SETTING_KEYS.topupFeePercent, String(feePercent));
  await recordAudit({
    actor: admin,
    action: "settings.update",
    targetType: "settings",
    targetId: "topup_fee",
    metadata: { feePercent },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard/wallet");
  return { success: true };
}

/**
 * The customer-recovery thresholds and the admin-editable automatic email
 * template — see src/lib/recovery.ts for how each one is actually used.
 * Validated to sane, non-empty bounds: a threshold of 0 or a negative
 * window would make every purchase "struggling", and an empty template
 * would send a blank email.
 */
export async function saveRecoverySettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const autoEmailEnabled = formData.get("autoEmailEnabled") === "on";
  const threshold = Number(formData.get("threshold"));
  const windowDays = Number(formData.get("windowDays"));
  const cooldownDays = Number(formData.get("cooldownDays"));
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 50) {
    return { error: "Enter a whole no-code threshold between 1 and 50." };
  }
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
    return { error: "Enter a whole detection window between 1 and 365 days." };
  }
  if (!Number.isInteger(cooldownDays) || cooldownDays < 0 || cooldownDays > 365) {
    return { error: "Enter a whole cooldown between 0 and 365 days." };
  }
  if (!subject || !body) {
    return { error: "The automatic email needs both a subject and a body." };
  }

  await Promise.all([
    writeSetting(SETTING_KEYS.noCodeRecoveryAutoEmailEnabled, autoEmailEnabled ? "true" : "false"),
    writeSetting(SETTING_KEYS.noCodeRecoveryThreshold, String(threshold)),
    writeSetting(SETTING_KEYS.noCodeRecoveryWindowDays, String(windowDays)),
    writeSetting(SETTING_KEYS.noCodeRecoveryEmailCooldownDays, String(cooldownDays)),
    writeSetting(SETTING_KEYS.noCodeRecoveryAutoEmailSubject, subject),
    writeSetting(SETTING_KEYS.noCodeRecoveryAutoEmailBody, body),
  ]);
  await recordAudit({
    actor: admin,
    action: "settings.update",
    targetType: "settings",
    targetId: "no_code_recovery",
    metadata: { autoEmailEnabled, threshold, windowDays, cooldownDays },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/recovery");
  return { success: true };
}

/**
 * The dashboard announcement bar. Plain text only: it is rendered as text by
 * React, never as HTML, and the length is bounded so a pasted essay cannot
 * push the dashboard off the screen.
 */
export async function saveAnnouncementAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const enabled = formData.get("enabled") === "on";
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (enabled && (!title || !message)) {
    return { error: "Add a title and a message, or switch the announcement off." };
  }
  if (title.length > ANNOUNCEMENT_TITLE_MAX) {
    return { error: `Keep the title under ${ANNOUNCEMENT_TITLE_MAX} characters.` };
  }
  if (message.length > ANNOUNCEMENT_MESSAGE_MAX) {
    return { error: `Keep the message under ${ANNOUNCEMENT_MESSAGE_MAX} characters.` };
  }

  await Promise.all([
    writeSetting(SETTING_KEYS.announcementEnabled, enabled ? "true" : "false"),
    writeSetting(SETTING_KEYS.announcementTitle, title),
    writeSetting(SETTING_KEYS.announcementMessage, message),
  ]);
  await recordAudit({
    actor: admin,
    action: "settings.update",
    targetType: "settings",
    targetId: "announcement",
    metadata: { enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export interface TestEmailState {
  status?: "sent" | "error";
  message?: string;
}

/**
 * A real send, through the exact same sendEmail() every other outbound
 * message in the app uses — never a dry-run or a client-side simulation.
 * Exists so a misconfigured RESEND_API_KEY, an EMAIL_FROM that never
 * actually took effect on this deployment, or a provider-side rejection
 * shows up as the *exact* error Resend returned, right here, instead of
 * something only visible by cross-referencing the Vercel and Resend
 * dashboards by hand.
 *
 * Defaults to the clicking admin's own address, but accepts an explicit
 * recipient too: sending to your own @xencodes.com address only proves
 * Resend accepts the message, since same-domain delivery has nothing to
 * authenticate. Whether an *external* inbox (Gmail, Outlook, ...) actually
 * places it in the inbox rather than spam is a genuinely different
 * question, and the only way to answer it is to send to that exact address.
 */
export async function sendTestEmailAction(
  _prev: TestEmailState,
  formData: FormData,
): Promise<TestEmailState> {
  const admin = await requireAdmin();
  const to = String(formData.get("to") ?? "").trim() || admin.email;

  try {
    await sendEmail({
      to,
      ...renderEmail(emailSettingsTestEmail({ fromAddress: emailFromAddress(), sentAt: new Date() })),
    });
    return { status: "sent", message: `Resend accepted it for ${to}, sent as "${emailFromAddress()}". If it doesn't land in that inbox within a minute, check spam/junk — Resend accepting it is not the same as the destination mailbox filing it under Inbox.` };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof EmailDeliveryError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : "Unknown error.",
    };
  }
}
