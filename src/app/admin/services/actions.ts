"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { revalidateCatalog } from "@/lib/catalog";

function refresh() {
  revalidateCatalog();
  revalidatePath("/admin/services");
  revalidatePath("/admin/pricing");
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

export interface MarkupState {
  error?: string;
  success?: boolean;
}

export async function setServiceMarkupAction(
  slug: string,
  _prev: MarkupState,
  formData: FormData,
): Promise<MarkupState> {
  await requireAdmin();
  const markupPercent = Number(formData.get("markupPercent"));
  if (!Number.isFinite(markupPercent) || markupPercent < -100 || markupPercent > 1000) {
    return { error: "Enter a percent between -100 and 1000." };
  }
  await prisma.serviceSetting.upsert({
    where: { slug },
    create: { slug, markupPercent },
    update: { markupPercent },
  });
  refresh();
  return { success: true };
}
