"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { writeSetting, SETTING_KEYS } from "@/lib/settings";
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
