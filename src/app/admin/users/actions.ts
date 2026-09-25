"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { creditWallet } from "@/lib/wallet";
import { majorToMinor } from "@/lib/currency";
import { recordAudit } from "@/lib/audit";

async function guardNotSelf(targetUserId: string, action: string) {
  const admin = await requireAdmin();
  if (admin.id === targetUserId) {
    throw new Error(`You can't ${action} your own account.`);
  }
  return admin;
}

export async function setUserStatusAction(userId: string, status: "ACTIVE" | "SUSPENDED") {
  const admin = await guardNotSelf(userId, status === "SUSPENDED" ? "suspend" : "reinstate");
  await prisma.user.update({ where: { id: userId }, data: { status } });
  await recordAudit({
    actor: admin,
    action: status === "SUSPENDED" ? "user.suspend" : "user.reactivate",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(userId: string, role: "USER" | "ADMIN") {
  const admin = await guardNotSelf(userId, role === "USER" ? "demote" : "promote");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await recordAudit({
    actor: admin,
    action: role === "ADMIN" ? "user.promote" : "user.demote",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export interface UserDeletionImpact {
  orders: number;
  fundingRecords: number;
  supportTickets: number;
}

/** What deleting this account will and will not touch, shown to the admin
 *  before they can confirm. Nothing here is acted on; it is read only. */
export async function getUserDeletionImpact(userId: string): Promise<UserDeletionImpact> {
  await requireAdmin();
  const [orders, fundingRecords, supportTickets] = await Promise.all([
    prisma.activation.count({ where: { userId } }),
    prisma.walletTransaction.count({ where: { userId } }),
    prisma.supportTicket.count({ where: { userId } }),
  ]);
  return { orders, fundingRecords, supportTickets };
}

/**
 * "Permanently deletes" an account the way a business that has to keep
 * financial records is actually allowed to: the account can never sign in
 * or be recovered, and its name, email, credentials and any standing
 * verification/reset tokens are gone, but its orders and wallet ledger
 * stay intact under an anonymised row rather than being destroyed.
 * Activation and WalletTransaction both reference this user with
 * onDelete: Restrict specifically so a real SQL delete here would fail
 * loudly instead of silently taking a customer's purchase and financial
 * history with it. Support tickets are left exactly the same way, for the
 * same reason: a past support conversation is not junk to sweep away just
 * because the account behind it is gone.
 *
 * EmailVerificationToken and PasswordResetToken rows are different: they
 * are not records of anything that happened, only latent capabilities
 * (verify this email, reset this password), and one left behind after the
 * email on the account has already been overwritten is pure debris, not
 * financial or audit history. Deleted here rather than left to expire on
 * their own.
 *
 * All of this runs in one transaction: a half-anonymised account with its
 * old tokens still standing, or the reverse, is not an acceptable partial
 * state for what is meant to be a single, atomic "delete".
 *
 * There is no undo: the real email is not recoverable once overwritten, so
 * the client requires typing it back before calling this.
 */
export async function deleteUserAction(userId: string) {
  const admin = await guardNotSelf(userId, "delete");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("That account no longer exists.");
  if (target.deletedAt) return;

  const anonymizedEmail = `deleted-${target.id}-${randomUUID().slice(0, 8)}@deleted.xencodes`;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        name: null,
        passwordHash: randomUUID(),
        twoFactorSecret: null,
        twoFactorEnabled: false,
        status: "SUSPENDED",
        deletedAt: new Date(),
      },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
  ]);

  await recordAudit({
    actor: admin,
    action: "user.delete",
    targetType: "user",
    targetId: userId,
    metadata: { previousEmail: target.email },
  });

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
  const admin = await requireAdmin();

  const amount = Number(formData.get("amount"));
  const note = (formData.get("note") as string)?.trim();

  if (!Number.isFinite(amount) || amount === 0) {
    return { error: "Enter a non-zero amount." };
  }
  if (!note) {
    return { error: "Add a short note for the audit trail." };
  }

  // The admin types a major-unit amount (e.g. "500"); which currency that
  // means is the target account's own, never assumed to be Naira.
  const target = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const minorAmount = majorToMinor(amount, target.currency);
  await creditWallet(userId, minorAmount, "ADJUSTMENT", note, target.currency);
  await recordAudit({
    actor: admin,
    action: "wallet.adjust",
    targetType: "user",
    targetId: userId,
    metadata: { amountMinor: minorAmount, currency: target.currency, note },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/wallet");
  return { success: true };
}
