"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAudit } from "@/lib/audit";
import { majorToMinor } from "@/lib/currency";
import { updateCurrencySettings, type CurrencyCode } from "@/lib/currency-config";
import { readFundingStates, saveFundingState } from "@/lib/funding-config";
import { saveFeePolicy } from "@/lib/fee-policy";
import type { Prisma } from "@/generated/prisma/client";
import { isFundingCurrencyCode } from "@/lib/funding-currencies";

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

  if (code === "NGN" && (!Number.isFinite(usdRate) || usdRate <= 0)) {
    return { error: "Enter a positive USD exchange rate." };
  }
  if (!Number.isFinite(minTopUp) || minTopUp <= 0) {
    return { error: "Enter a positive minimum top up." };
  }
  if (!Number.isFinite(maxTopUp) || maxTopUp <= minTopUp) {
    return { error: "The maximum top up must be greater than the minimum." };
  }

  const currency = code as CurrencyCode;
  const minTopUpMinor = majorToMinor(minTopUp, currency);
  const maxTopUpMinor = majorToMinor(maxTopUp, currency);

  await updateCurrencySettings(currency, {
    ...(currency === "NGN" ? { usdRate } : {}),
    minTopUpMinor,
    maxTopUpMinor,
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
    },
  });

  refresh();
  return { success: true };
}

export interface FundingCurrencyFormState {
  error?: string;
  success?: boolean;
}

/**
 * Saves one local funding currency (GHS, KES, XAF, XOF, EGP, TZS): switched
 * on or off, its exchange rate against USD, its processing fee and limits.
 * Enabling needs a rate and an explicit confirmation that the payment method
 * is already enabled on the Xencodes KoraPay account, so a currency cannot
 * be shown to customers on the strength of this file's own defaults.
 */
export async function saveFundingCurrencyAction(
  _prev: FundingCurrencyFormState,
  formData: FormData,
): Promise<FundingCurrencyFormState> {
  const admin = await requireAdmin();

  const code = (formData.get("code") as string)?.trim().toUpperCase();
  if (!isFundingCurrencyCode(code)) return { error: "Unknown currency." };

  const enabled = formData.get("enabled") === "on";
  const confirmed = formData.get("confirmed") === "on";
  const usdRate = Number(formData.get("usdRate"));
  const followMarket = formData.get("followMarket") === "on";
  const minMinor = majorToMinor(Number(formData.get("minAmount")), code);
  const maxMinor = majorToMinor(Number(formData.get("maxAmount")), code);

  if (enabled && !confirmed) {
    return {
      error: `Confirm that ${code} payments are enabled on the Xencodes KoraPay account before switching this on.`,
    };
  }
  if (enabled && !followMarket && !(Number.isFinite(usdRate) && usdRate > 0)) {
    return { error: "Enter this currency's exchange rate (units per 1 USD) before switching it on." };
  }
  if (!Number.isFinite(minMinor) || !Number.isFinite(maxMinor) || minMinor <= 0 || maxMinor < minMinor) {
    return { error: "Enter a positive minimum and a maximum that is not below it." };
  }

  const before = (await readFundingStates())[code];
  const result = await saveFundingState(code, {
    enabled,
    usdRate: Number.isFinite(usdRate) && usdRate > 0 ? usdRate : 0,
    followMarket,
    minMinor,
    maxMinor,
  });
  if (!result.ok) {
    return {
      error:
        result.error === "fee_not_approved"
          ? `Approve a ${code} funding fee first (below), even if the decision is no fee, then switch this on.`
          : "Those settings were not accepted. Check the rate and limits.",
    };
  }

  await recordAudit({
    actor: admin,
    action: "funding_currency.save",
    targetType: "funding_currency",
    targetId: code,
    metadata: {
      code,
      before: {
        enabled: before.enabled,
        usdRate: before.usdRate,
        followMarket: before.followMarket,
        minMinor: before.minMinor,
        maxMinor: before.maxMinor,
      },
      after: { enabled, usdRate: usdRate > 0 ? usdRate : null, followMarket, minMinor, maxMinor },
      korapayConfirmed: enabled ? confirmed : null,
    },
  });

  refresh();
  return { success: true };
}

export interface FeePolicyFormState {
  error?: string;
  success?: boolean;
}

/**
 * Saves the funding fee decision for one currency: the amount (percent or
 * flat, with an optional cap), whether it is APPROVED, and whether it is
 * ENABLED. Only an approved, enabled fee is ever shown or charged, and the
 * server resolves it from this record on every quote (see
 * src/lib/fee-policy.ts). Approving records who and when; every change is
 * audit-logged with the before and after.
 */
export async function saveFeePolicyAction(
  _prev: FeePolicyFormState,
  formData: FormData,
): Promise<FeePolicyFormState> {
  const admin = await requireAdmin();

  const currency = (formData.get("currency") as string)?.trim().toUpperCase();
  if (currency !== "NGN" && !isFundingCurrencyCode(currency)) return { error: "Unknown currency." };

  const model = formData.get("model") === "fixed" ? "fixed" : "percent";
  const percent = Number(formData.get("percent") || 0);
  const fixedMajor = Number(formData.get("fixed") || 0);
  const capRaw = String(formData.get("cap") ?? "").trim();
  const capMajor = capRaw === "" ? null : Number(capRaw);
  const approved = formData.get("approved") === "on";
  const enabled = formData.get("enabled") === "on";

  if (model === "percent" && !(Number.isFinite(percent) && percent >= 0 && percent <= 50)) {
    return { error: "The fee percentage must be between 0 and 50." };
  }
  if (model === "fixed" && !(Number.isFinite(fixedMajor) && fixedMajor >= 0)) {
    return { error: "Enter a flat fee of zero or more." };
  }
  if (capMajor !== null && !(Number.isFinite(capMajor) && capMajor >= 0)) {
    return { error: "The cap must be zero or more, or left empty for no cap." };
  }

  const result = await saveFeePolicy(
    "wallet_funding",
    currency,
    {
      model,
      percent,
      fixedMinor: majorToMinor(fixedMajor, currency),
      capMinor: capMajor === null ? null : majorToMinor(capMajor, currency),
      approved,
      enabled,
    },
    admin,
  );
  if (!result.ok) {
    return {
      error:
        result.error === "enable_needs_approval"
          ? "A fee must be approved before it can be switched on."
          : "Those fee settings were not accepted.",
    };
  }

  await recordAudit({
    actor: admin,
    action: "fee_policy.save",
    targetType: "fee_policy",
    targetId: `wallet_funding:${currency}`,
    metadata: {
      before: result.before as unknown as Prisma.InputJsonValue,
      after: result.after as unknown as Prisma.InputJsonValue,
    },
  });

  refresh();
  return { success: true };
}
