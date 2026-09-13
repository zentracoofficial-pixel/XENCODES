"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { creditWallet } from "@/lib/wallet";
import { nairaToKobo } from "@/lib/currency";

async function guardNotSelf(targetUserId: string, action: string) {
  const admin = await requireAdmin();
  if (admin.id === targetUserId) {
    throw new Error(`You can't ${action} your own account.`);
  }
  return admin;
}

export async function setUserStatusAction(userId: string, status: "ACTIVE" | "SUSPENDED") {
  await guardNotSelf(userId, status === "SUSPENDED" ? "suspend" : "reinstate");
  await prisma.user.update({ where: { id: userId }, data: { status } });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(userId: string, role: "USER" | "ADMIN") {
  await guardNotSelf(userId, role === "USER" ? "demote" : "promote");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

/**
 * Permanently removes an account: their activations, wallet transactions and
 * auth tokens cascade with it (see schema.prisma). There is no undo, so the
 * client requires typing the account's email back before calling this.
 */
export async function deleteUserAction(userId: string) {
  await guardNotSelf(userId, "delete");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}

export interface CreditWalletState {
  error?: string;
  success?: boolean;
}

export async function adminCreditWalletAction(
  userId: string,
  _prev: CreditWalletState,
  formData: FormData,
): Promise<CreditWalletState> {
  await requireAdmin();

  const amount = Number(formData.get("amount"));
  const note = (formData.get("note") as string)?.trim();

  if (!Number.isFinite(amount) || amount === 0) {
    return { error: "Enter a non-zero amount." };
  }
  if (!note) {
    return { error: "Add a short note for the audit trail." };
  }

  const kobo = nairaToKobo(amount);
  await creditWallet(userId, kobo, "ADJUSTMENT", note);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/payments");
  return { success: true };
}
