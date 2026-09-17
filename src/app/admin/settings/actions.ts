"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { writeSetting, SETTING_KEYS } from "@/lib/settings";
import { MAX_MARGIN_PERCENT } from "@/lib/pricing";

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
  await requireAdmin();

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
  await requireAdmin();

  const providerId = (formData.get("providerId") as string)?.trim() ?? "";
  const baseUrl = (formData.get("providerBaseUrl") as string)?.trim() ?? "";
  const enabled = formData.get("providerEnabled") === "on";

  if (baseUrl) {
    try {
      new URL(baseUrl);
    } catch {
      return { error: "Enter a valid base URL, for example https://api.provider.com." };
    }
  }

  if (enabled && !providerId) {
    return { error: "Choose a provider before switching the connection on." };
  }

  await Promise.all([
    writeSetting(SETTING_KEYS.providerId, providerId),
    writeSetting(SETTING_KEYS.providerBaseUrl, baseUrl),
    writeSetting(SETTING_KEYS.providerEnabled, String(enabled)),
  ]);

  refresh();
  return { success: true };
}
