"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { MIN_PRICE_MULTIPLIER, MAX_PRICE_MULTIPLIER } from "@/lib/pricing";

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
}

/**
 * Sets one service's price multiple (the customer pays this many times the
 * provider's cost), or clears it back to the platform rules.
 *
 * An empty field means "follow the rules", stored as null. 1 is left as a
 * usable value on purpose: it is a real instruction, namely sell this
 * service at cost, and an admin who types it should get it rather than
 * have it silently treated as "unset". A service set earlier as a margin
 * percent is replaced by the multiplier typed here.
 */
export async function setServiceMarginAction(
  slug: string,
  _prev: MarginState,
  formData: FormData,
): Promise<MarginState> {
  await requireAdmin();

  const raw = (formData.get("priceMultiplier") as string)?.trim();

  if (!raw) {
    await prisma.serviceSetting.upsert({
      where: { slug },
      create: { slug, grossMarginPercent: null, priceMultiplier: null },
      update: { grossMarginPercent: null, priceMultiplier: null },
    });
    refresh();
    return { success: true };
  }

  const multiplier = Number(raw);
  if (
    !Number.isFinite(multiplier) ||
    multiplier < MIN_PRICE_MULTIPLIER ||
    multiplier > MAX_PRICE_MULTIPLIER
  ) {
    return {
      error: `Enter a multiple between ${MIN_PRICE_MULTIPLIER} and ${MAX_PRICE_MULTIPLIER}, for example 3, or leave it blank to use the platform rules.`,
    };
  }

  const rounded = Math.round(multiplier * 100) / 100;
  await prisma.serviceSetting.upsert({
    where: { slug },
    create: { slug, grossMarginPercent: null, priceMultiplier: rounded },
    update: { grossMarginPercent: null, priceMultiplier: rounded },
  });
  refresh();
  return { success: true };
}
