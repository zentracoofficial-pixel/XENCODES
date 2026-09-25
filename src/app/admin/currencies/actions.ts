"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAudit } from "@/lib/audit";
import { isValidCurrencyCode, majorToMinor } from "@/lib/currency";
import {
  upsertCurrency,
  setCurrencyEnabled,
  removeCurrency,
  type CurrencyConfigEntry,
} from "@/lib/currency-config";

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
 * Adds a new currency, or replaces an existing one with the same code.
 *
 * Enabling a currency here is a real commercial claim: that KoraPay can
 * actually charge and settle it for this merchant account, and that the
 * admin has a real, current USD exchange rate for it. Neither of those
 * facts can be verified from inside this codebase, so this form only
 * records what an admin states; it never assumes or fabricates either one.
 */
export async function saveCurrencyAction(
  _prev: CurrencyFormState,
  formData: FormData,
): Promise<CurrencyFormState> {
  const admin = await requireAdmin();

  const code = (formData.get("code") as string)?.trim().toUpperCase();
  const usdRate = Number(formData.get("usdRate"));
  const minTopUp = Number(formData.get("minTopUp"));
  const maxTopUp = Number(formData.get("maxTopUp"));
  const feeCap = Number(formData.get("feeCap"));
  const priority = Number(formData.get("priority"));
  const countryLabel = (formData.get("countryLabel") as string)?.trim() || undefined;
  const enabled = formData.get("enabled") === "on";

  if (!code || !isValidCurrencyCode(code)) {
    return { error: "Enter a real ISO 4217 currency code, for example GHS." };
  }
  if (!Number.isFinite(usdRate) || usdRate <= 0) {
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
  if (!Number.isInteger(priority)) {
    return { error: "Priority must be a whole number." };
  }

  const entry: CurrencyConfigEntry = {
    code,
    enabled,
    usdRate,
    minTopUpMinor: majorToMinor(minTopUp, code),
    maxTopUpMinor: majorToMinor(maxTopUp, code),
    feeCapMinor: majorToMinor(feeCap, code),
    priority,
    countryLabel,
  };

  await upsertCurrency(entry);
  await recordAudit({
    actor: admin,
    action: "currency.save",
    targetType: "currency",
    targetId: code,
    metadata: {
      code: entry.code,
      enabled: entry.enabled,
      usdRate: entry.usdRate,
      minTopUpMinor: entry.minTopUpMinor,
      maxTopUpMinor: entry.maxTopUpMinor,
      feeCapMinor: entry.feeCapMinor,
      priority: entry.priority,
      countryLabel: entry.countryLabel ?? null,
    },
  });

  refresh();
  return { success: true };
}

export interface CurrencyActionResult {
  ok: boolean;
  error?: string;
}

export async function toggleCurrencyEnabledAction(
  code: string,
  enabled: boolean,
): Promise<CurrencyActionResult> {
  const admin = await requireAdmin();
  try {
    await setCurrencyEnabled(code, enabled);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save." };
  }

  await recordAudit({
    actor: admin,
    action: enabled ? "currency.enable" : "currency.disable",
    targetType: "currency",
    targetId: code,
    metadata: { code, enabled },
  });

  refresh();
  return { ok: true };
}

export async function removeCurrencyAction(code: string): Promise<CurrencyActionResult> {
  const admin = await requireAdmin();
  const result = await removeCurrency(code);
  if (!result.removed) {
    return { ok: false, error: result.reason };
  }

  await recordAudit({
    actor: admin,
    action: "currency.remove",
    targetType: "currency",
    targetId: code,
  });

  refresh();
  return { ok: true };
}
