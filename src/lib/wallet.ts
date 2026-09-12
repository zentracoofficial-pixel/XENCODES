import { prisma } from "@/lib/prisma";
import { WalletTransactionType } from "@/generated/prisma/client";

export async function creditWallet(
  userId: string,
  amountCents: number,
  type: Extract<WalletTransactionType, "TOPUP" | "REFUND">,
  description: string,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { walletBalanceCents: { increment: amountCents } },
    });
    await tx.walletTransaction.create({
      data: { userId, amountCents, type, description },
    });
    return user;
  });
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
