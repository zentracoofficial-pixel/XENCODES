import { prisma } from "@/lib/prisma";
import { WalletTransactionType } from "@/generated/prisma/client";

/**
 * Moves a balance and records why, atomically.
 *
 * Used for refunds and admin adjustments only. TOPUP is deliberately not
 * an accepted type here, not just by convention: a WalletTransaction's
 * status defaults to SUCCESSFUL, so a TOPUP created through this function
 * would credit a balance immediately with no payment ever having been
 * verified, which is exactly the "test funding leaks into production"
 * failure mode. Crediting money a customer actually paid in is
 * completeTopUp() in src/lib/funding.ts, which only runs after a payment
 * has been verified with the payment provider and only ever moves a row
 * that already exists as PENDING to SUCCESSFUL, once.
 */
export async function creditWallet(
  userId: string,
  amountKobo: number,
  type: Extract<WalletTransactionType, "REFUND" | "ADJUSTMENT">,
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
