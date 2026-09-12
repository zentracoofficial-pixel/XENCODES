"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { revalidateCatalog } from "@/lib/catalog";

export async function setCountryEnabledAction(slug: string, enabled: boolean) {
  await requireAdmin();
  await prisma.countrySetting.upsert({
    where: { slug },
    create: { slug, enabled },
    update: { enabled },
  });
  revalidateCatalog();
  revalidatePath("/admin/countries");
  revalidatePath("/admin/pricing");
}
