import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { WalletTransaction } from "@/generated/prisma/client";
import {
  WALLET_CURRENCY,
  FUNDING_PROVIDER,
  validateTopUpAmount,
} from "@/lib/funding-limits";

/**
 * Wallet funding: asking for money, and the one path by which receiving it
 * is allowed to change a balance.
 *
 * The rule the whole file exists to enforce: a customer's balance only ever
 * moves when a payment has been confirmed by the payment provider, on the
 * server. Creating a funding attempt does not credit anything. Returning
 * from a checkout page does not credit anything. Only completeTopUp(),
 * called after a real verification, does, and it refuses to run twice for
 * the same reference.
 *
 * KoraPay is the intended provider. Nothing here talks to it yet: the
 * pieces it will need (a reference generated before checkout, a pending
 * row to match a webhook against, an idempotent completion) are in place
 * so that wiring it up is filling in one adapter rather than reworking the
 * wallet.
 */

export {
  WALLET_CURRENCY,
  FUNDING_PROVIDER,
  MIN_TOPUP_KOBO,
  MAX_TOPUP_KOBO,
  FUNDING_ERROR_COPY,
  validateTopUpAmount,
  type FundingError,
} from "@/lib/funding-limits";

/**
 * Our own reference for a funding attempt, generated before the provider
 * is contacted so it can be handed to them and quoted back in a webhook.
 * Random rather than sequential: it ends up in URLs and provider
 * dashboards, and should not imply how many payments the platform has
 * taken.
 */
function newReference() {
  return `xen_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}

/**
 * Records that a customer wants to add money, and returns the row.
 *
 * Deliberately does not touch walletBalanceKobo. The row is PENDING and
 * stays that way until a payment is verified. Anything that sums a
 * balance must therefore ignore non-SUCCESSFUL rows, which the balance
 * column does by construction since nothing increments it here.
 */
export async function createPendingTopUp(
  userId: string,
  amountKobo: number,
): Promise<WalletTransaction> {
  const invalid = validateTopUpAmount(amountKobo);
  if (invalid) throw new Error(invalid);

  return prisma.walletTransaction.create({
    data: {
      userId,
      type: "TOPUP",
      amountKobo,
      currency: WALLET_CURRENCY,
      status: "PENDING",
      provider: FUNDING_PROVIDER.id,
      providerReference: newReference(),
      description: "Wallet top up",
    },
  });
}

/**
 * Credits a verified payment, exactly once.
 *
 * This is the only function in the codebase permitted to increase a wallet
 * balance from a customer payment, and the only one the payment provider's
 * webhook or verification callback should ever call. The caller must have already
 * confirmed with the provider that the money was received: this function
 * trusts its caller about the payment and guarantees only that the credit
 * happens once and atomically.
 *
 * Idempotent by design. A provider that retries a webhook, or sends both a
 * callback and a webhook for the same payment, must not be able to credit
 * twice: the status check runs inside the transaction, so a second call
 * finds the row already SUCCESSFUL and does nothing.
 */
export async function completeTopUp(
  providerReference: string,
  providerTransactionId?: string,
): Promise<{ credited: boolean; reason?: string }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.walletTransaction.findUnique({
      where: { providerReference },
    });

    if (!row) return { credited: false, reason: "unknown_reference" };
    if (row.type !== "TOPUP") return { credited: false, reason: "not_a_topup" };
    if (row.status === "SUCCESSFUL") {
      // Already credited by an earlier delivery of the same event.
      return { credited: false, reason: "already_credited" };
    }
    if (row.status !== "PENDING") {
      return { credited: false, reason: `cannot_complete_from_${row.status}` };
    }

    await tx.walletTransaction.update({
      where: { id: row.id },
      data: {
        status: "SUCCESSFUL",
        completedAt: new Date(),
        providerTransactionId: providerTransactionId ?? row.providerTransactionId,
      },
    });

    await tx.user.update({
      where: { id: row.userId },
      data: { walletBalanceKobo: { increment: row.amountKobo } },
    });

    return { credited: true };
  });
}

/** Closes out a funding attempt that will not complete. Never touches the
 *  balance, because a pending top up never contributed to it. */
export async function settleFailedTopUp(
  providerReference: string,
  status: "FAILED" | "CANCELLED",
  failureReason?: string,
) {
  const row = await prisma.walletTransaction.findUnique({
    where: { providerReference },
  });
  if (!row || row.status !== "PENDING") return;

  await prisma.walletTransaction.update({
    where: { id: row.id },
    data: { status, failureReason, completedAt: new Date() },
  });
}
