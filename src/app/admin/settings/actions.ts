"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { writeSetting, SETTING_KEYS } from "@/lib/settings";
import { revalidateCatalog } from "@/lib/catalog";

export interface ProviderSettingsState {
  error?: string;
  success?: boolean;
}

export async function saveProviderSettingsAction(
  _prev: ProviderSettingsState,
  formData: FormData,
): Promise<ProviderSettingsState> {
  await requireAdmin();

  const name = (formData.get("providerName") as string)?.trim();
  const baseUrl = (formData.get("providerBaseUrl") as string)?.trim();
  const apiKey = (formData.get("providerApiKey") as string)?.trim();
  const enabled = formData.get("providerEnabled") === "on";

  if (baseUrl) {
    try {
      new URL(baseUrl);
    } catch {
      return { error: "Enter a valid base URL, e.g. https://api.provider.com." };
    }
  }

  if (enabled && (!name || !baseUrl)) {
    return { error: "Add a provider name and base URL before enabling the connection." };
  }

  await Promise.all([
    writeSetting(SETTING_KEYS.providerName, name ?? ""),
    writeSetting(SETTING_KEYS.providerBaseUrl, baseUrl ?? ""),
    writeSetting(SETTING_KEYS.providerEnabled, String(enabled)),
    // A blank key field means "leave the stored key alone", never overwrite it with "".
    apiKey ? writeSetting(SETTING_KEYS.providerApiKey, apiKey) : Promise.resolve(),
  ]);

  revalidateCatalog();
  revalidatePath("/admin/settings");
  revalidatePath("/admin");

  return { success: true };
}
