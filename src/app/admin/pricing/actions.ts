"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { writeSetting, SETTING_KEYS } from "@/lib/settings";
import { revalidateCatalog } from "@/lib/catalog";

export interface GlobalMarkupState {
  error?: string;
  success?: boolean;
}

export async function setGlobalMarkupAction(
  _prev: GlobalMarkupState,
  formData: FormData,
): Promise<GlobalMarkupState> {
  await requireAdmin();
  const percent = Number(formData.get("percent"));
  if (!Number.isFinite(percent) || percent < -100 || percent > 1000) {
    return { error: "Enter a percent between -100 and 1000." };
  }
  await writeSetting(SETTING_KEYS.globalMarkupPercent, String(percent));
  revalidateCatalog();
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/services");
  return { success: true };
}
