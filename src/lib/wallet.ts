import { prisma } from "@/lib/prisma";
import { WalletTransactionType } from "@/generated/prisma/client";

export async function creditWallet(
  userId: string,
  amountKobo: number,
  type: Extract<WalletTransactionType, "TOPUP" | "REFUND" | "ADJUSTMENT">,
  description: string,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { walletBalanceKobo: { increment: amountKobo } },
    });
    await tx.walletTransaction.create({
      data: { userId, amountKobo, type, description },
    });
    return user;
  });
}
