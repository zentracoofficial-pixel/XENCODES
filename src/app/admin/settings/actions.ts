"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { writeSetting, SETTING_KEYS } from "@/lib/settings";
import { MAX_MARGIN_PERCENT } from "@/lib/pricing";
import { availableAdapterIds } from "@/lib/provider";
import { recordAudit } from "@/lib/audit";

function refresh() {
  revalidatePath("/admin/settings");
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
 * Which number provider to use, and whether the connection is live.
 *
 * No API key field, deliberately. A supplier's credentials come from this
 * deployment's environment variables and are read only inside
 * src/lib/provider, so no secret is ever stored in the database or
 * readable back through this panel.
 */
export async function saveProviderSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const providerId = (formData.get("providerId") as string)?.trim() ?? "";
  const enabled = formData.get("providerEnabled") === "on";

  if (providerId && !availableAdapterIds().includes(providerId)) {
    return { error: "That provider has no integration built yet." };
  }
  if (enabled && !providerId) {
    return { error: "Choose a provider before switching the connection on." };
  }

  await Promise.all([
    writeSetting(SETTING_KEYS.providerId, providerId),
    writeSetting(SETTING_KEYS.providerEnabled, String(enabled)),
  ]);
  await recordAudit({
    actor: admin,
    action: "settings.update",
    targetType: "settings",
    targetId: "provider",
    metadata: { providerId, enabled },
  });

  refresh();
  return { success: true };
}

/**
 * The Naira per US dollar rate GrizzlySMS's dollar-denominated costs are
 * converted at, before margin is applied. Kept separate from the provider
 * form's submit so an admin nudging this number does not also have to
 * retype the provider selection.
 */
export async function saveUsdRateAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();

  const rate = Number(formData.get("usdToNgnRate"));
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: "Enter a valid Naira per US dollar rate, greater than zero." };
  }

  await writeSetting(SETTING_KEYS.usdToNgnRate, String(rate));
  await recordAudit({
    actor: admin,
    action: "settings.update",
    targetType: "settings",
    targetId: "usd_to_ngn_rate",
    metadata: { rate },
  });

  refresh();
  return { success: true };
}
