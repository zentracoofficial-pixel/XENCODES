"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { MAX_MARGIN_PERCENT } from "@/lib/pricing";

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
 * Sets one service's gross margin, or clears it back to the platform rules.
 *
 * An empty field means "follow the rules", stored as null. Zero is left as
 * a usable value on purpose: it is a real instruction, namely sell this
 * service at cost, and an admin who types it should get it rather than
 * have it silently treated as "unset".
 */
export async function setServiceMarginAction(
  slug: string,
  _prev: MarginState,
  formData: FormData,
): Promise<MarginState> {
  await requireAdmin();

  const raw = (formData.get("grossMarginPercent") as string)?.trim();

  if (!raw) {
    await prisma.serviceSetting.upsert({
      where: { slug },
      create: { slug, grossMarginPercent: null },
      update: { grossMarginPercent: null },
    });
    refresh();
    return { success: true };
  }

  const percent = Number(raw);
  if (!Number.isInteger(percent) || percent < 0 || percent > MAX_MARGIN_PERCENT) {
    return {
      error: `Enter a whole percent between 0 and ${MAX_MARGIN_PERCENT}, or leave it blank to use the platform rules.`,
    };
  }

  await prisma.serviceSetting.upsert({
    where: { slug },
    create: { slug, grossMarginPercent: percent },
    update: { grossMarginPercent: percent },
  });
  refresh();
  return { success: true };
}
