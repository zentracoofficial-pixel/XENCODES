import { prisma } from "@/lib/prisma";
import { WalletTransactionType } from "@/generated/prisma/client";

/**
 * Moves a balance and records why, atomically.
 *
 * Used for refunds and admin adjustments. Customer payments do NOT come
 * through here: crediting money a customer paid in is completeTopUp() in
 * src/lib/funding.ts, which will only run once a payment has been verified
 * with the payment provider.
 */
export async function creditWallet(
  userId: string,
  amountKobo: number,
  type: Extract<WalletTransactionType, "TOPUP" | "REFUND" | "ADJUSTMENT">,
  description: string,
  activationId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { walletBalanceKobo: { increment: amountKobo } },
    });
    await tx.walletTransaction.create({
      data: { userId, amountKobo, type, description, activationId },
    });
    return user;
  });
}
