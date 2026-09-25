"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAudit } from "@/lib/audit";
import { majorToMinor } from "@/lib/currency";
import { updateCurrencySettings, type CurrencyCode } from "@/lib/currency-config";

function refresh() {
  revalidatePath("/admin/currencies");
  revalidatePath("/admin/settings");
  revalidatePath("/");
  revalidatePath("/buy");
  revalidatePath("/pricing");
  revalidatePath("/dashboard/buy");
  revalidatePath("/dashboard/wallet");
}

export interface CurrencyFormState {
  error?: string;
  success?: boolean;
}

/**
 * Saves one currency's rate and top-up bounds. There is no add/remove here:
 * NGN and USD are the whole set, permanently, so this only ever edits one
 * of the two existing rows. usdRate is accepted but ignored for USD, since
 * 1 USD converted into USD is always 1 USD and this form cannot be used to
 * pretend otherwise.
 */
export async function saveCurrencyAction(
  _prev: CurrencyFormState,
  formData: FormData,
): Promise<CurrencyFormState> {
  const admin = await requireAdmin();

  const code = (formData.get("code") as string)?.trim().toUpperCase();
  if (code !== "NGN" && code !== "USD") {
    return { error: "Unknown currency." };
  }

  const usdRate = Number(formData.get("usdRate"));
  const minTopUp = Number(formData.get("minTopUp"));
  const maxTopUp = Number(formData.get("maxTopUp"));
  const feeCap = Number(formData.get("feeCap"));

  if (code === "NGN" && (!Number.isFinite(usdRate) || usdRate <= 0)) {
    return { error: "Enter a positive USD exchange rate." };
  }
  if (!Number.isFinite(minTopUp) || minTopUp <= 0) {
    return { error: "Enter a positive minimum top up." };
  }
  if (!Number.isFinite(maxTopUp) || maxTopUp <= minTopUp) {
    return { error: "The maximum top up must be greater than the minimum." };
  }
  if (!Number.isFinite(feeCap) || feeCap < 0) {
    return { error: "Enter a non-negative fee cap." };
  }

  const currency = code as CurrencyCode;
  const minTopUpMinor = majorToMinor(minTopUp, currency);
  const maxTopUpMinor = majorToMinor(maxTopUp, currency);
  const feeCapMinor = majorToMinor(feeCap, currency);

  await updateCurrencySettings(currency, {
    ...(currency === "NGN" ? { usdRate } : {}),
    minTopUpMinor,
    maxTopUpMinor,
    feeCapMinor,
  });
  await recordAudit({
    actor: admin,
    action: "currency.save",
    targetType: "currency",
    targetId: currency,
    metadata: {
      code: currency,
      usdRate: currency === "NGN" ? usdRate : 1,
      minTopUpMinor,
      maxTopUpMinor,
      feeCapMinor,
    },
  });

  refresh();
  return { success: true };
}
