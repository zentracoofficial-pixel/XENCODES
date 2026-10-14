"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { loadMarginRules, resolveMultiplier } from "@/lib/pricing";
import { recordAudit } from "@/lib/audit";
import { formatMultiplier, multiplierToMarginPercent, parsePriceInput, type PricePreviewResult, type PriceUnit } from "@/lib/price-multiplier";
import { previewPriceChange } from "@/lib/pricing-preview";

function refresh() {
  revalidatePath("/admin/services");
  revalidatePath("/buy");
  revalidatePath("/dashboard/buy");
}

export async function setServiceEnabledAction(slug: string, enabled: boolean) {
  await requireAdmin();
  await prisma.serviceSetting.upsert({
    where: { slug },
    create: { slug, enabled },
    update: { enabled },
  });
  refresh();
}

export interface MarginState {
  error?: string;
  success?: boolean;
  /** What the save changed, in words: "5x (80% margin) to 3x (66.7% margin)". */
  summary?: string;
}

const describe = (multiplier: number) => `${formatMultiplier(multiplier)} (${multiplierToMarginPercent(multiplier)}% margin)`;

/** Before saving: what this price would do to a few sample provider costs. */
export async function previewServicePriceAction(
  slug: string,
  raw: string,
  unit: PriceUnit,
): Promise<PricePreviewResult> {
  await requireAdmin();
  if (!raw.trim()) return { preview: await previewPriceChange({ kind: "service", slug }, null) };
  const parsed = parsePriceInput(raw, unit);
  if ("error" in parsed) return { error: parsed.error };
  return { preview: await previewPriceChange({ kind: "service", slug }, parsed.multiplier) };
}

/**
 * Sets one service's price, typed either as a multiple of the provider's
 * cost ("3", with x) or as a margin percent ("67", with %), or clears it back
 * to the platform rules.
 *
 * An empty field means "follow the rules", stored as null. 1x is left as a
 * usable value on purpose: it is a real instruction, namely sell this
 * service at cost, and an admin who types it should get it rather than
 * have it silently treated as "unset". A service set earlier as a margin
 * percent is replaced by the multiplier typed here. What changed is
 * recorded in the activity log with the before and after.
 */
export async function setServiceMarginAction(
  slug: string,
  _prev: MarginState,
  formData: FormData,
): Promise<MarginState> {
  const admin = await requireAdmin();

  const raw = ((formData.get("priceValue") as string) ?? "").trim();
  const unit: PriceUnit = formData.get("priceUnit") === "%" ? "%" : "x";

  const before = resolveMultiplier(await loadMarginRules(), slug).multiplier;

  let newMultiplier: number | null = null;
  if (raw) {
    const parsed = parsePriceInput(raw, unit);
    if ("error" in parsed) return { error: parsed.error };
    newMultiplier = parsed.multiplier;
  }

  await prisma.serviceSetting.upsert({
    where: { slug },
    create: { slug, grossMarginPercent: null, priceMultiplier: newMultiplier },
    update: { grossMarginPercent: null, priceMultiplier: newMultiplier },
  });

  const rulesAfter = await loadMarginRules();
  const after = resolveMultiplier(rulesAfter, slug).multiplier;
  await recordAudit({
    actor: admin,
    action: "service.price",
    targetType: "service",
    targetId: slug,
    metadata: {
      beforeMultiplier: before,
      afterMultiplier: after,
      typedAs: raw ? `${raw}${unit}` : "cleared to the platform rules",
    },
  });

  refresh();
  return {
    success: true,
    summary:
      Math.abs(before - after) < 0.005
        ? `Saved. Still ${describe(after)}.`
        : `Saved. ${describe(before)} to ${describe(after)}.`,
  };
}
