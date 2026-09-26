"use server";

import { revalidatePath } from "next/cache";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Per-user favorite services (see FavoriteService in schema.prisma). A
 * favorite only ever remembers a service — never a country or a price —
 * since the buy flow always re-checks live availability and quotes fresh
 * regardless of how a service got selected.
 */
export async function toggleFavoriteServiceAction(
  serviceSlug: string,
  serviceName: string,
): Promise<{ favorited: boolean } | null> {
  const user = await getActiveUser();
  if (!user) return null;

  const existing = await prisma.favoriteService.findUnique({
    where: { userId_serviceSlug: { userId: user.id, serviceSlug } },
  });

  if (existing) {
    await prisma.favoriteService.delete({ where: { id: existing.id } });
    revalidatePath("/dashboard");
    return { favorited: false };
  }

  await prisma.favoriteService.create({
    data: { userId: user.id, serviceSlug, serviceName },
  });
  revalidatePath("/dashboard");
  return { favorited: true };
}
