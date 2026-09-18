import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { WalletTransaction } from "@/generated/prisma/client";
import {
  WALLET_CURRENCY,
  FUNDING_PROVIDER,
  validateTopUpAmount,
} from "@/lib/funding-limits";
import { verifyKorapayCharge, KorapayError } from "@/lib/korapay";

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
 * KoraPay is the provider (src/lib/korapay.ts). Both the webhook and the
 * customer's return from checkout route through verifyAndSettleTopUp()
 * below, so there is exactly one place that decides a payment is real: a
 * webhook body's own claims are never trusted for crediting, only used to
 * know which reference to go ask KoraPay about directly.
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

/**
 * Whether a SUCCESSFUL TOPUP could only exist because of the exact bug
 * this architecture no longer allows: a wallet credited without a payment
 * ever being verified. completeTopUp() is the only function that can move
 * a TOPUP to SUCCESSFUL, and it always writes the provider's own
 * transaction id when it does that, so a SUCCESSFUL TOPUP with no
 * providerTransactionId could not be created today. One that exists
 * anyway predates this and is what voidUnverifiedTopup() below reverses.
 *
 * This only flags; it never deletes or changes anything by itself, and it
 * can never match a real payment, since a real one always has this field.
 */
export function isUnverifiedTopup(tx: {
  type: string;
  status: string;
  providerTransactionId: string | null;
}): boolean {
  return tx.type === "TOPUP" && tx.status === "SUCCESSFUL" && !tx.providerTransactionId;
}

export type VoidUnverifiedTopupResult =
  | { voided: true; amountKobo: number; userId: string }
  | { voided: false; reason: "not_found" | "not_an_unverified_topup" };

/**
 * Reverses exactly the failure mode isUnverifiedTopup() detects: a TOPUP
 * that was marked SUCCESSFUL and credited a balance without a real
 * payment behind it. Refuses everything else, including a TOPUP that does
 * carry a providerTransactionId (that one was actually verified and must
 * never be touched by this) and any non-TOPUP row, so this cannot be used
 * to alter a purchase, refund, or admin adjustment.
 *
 * The reversing decrement and the status change happen in one
 * transaction: a balance is never left debited without the row that
 * explains why, or vice versa.
 */
export async function voidUnverifiedTopup(
  transactionId: string,
): Promise<VoidUnverifiedTopupResult> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.walletTransaction.findUnique({ where: { id: transactionId } });
    if (!row) return { voided: false, reason: "not_found" };
    if (!isUnverifiedTopup(row)) {
      return { voided: false, reason: "not_an_unverified_topup" };
    }

    await tx.walletTransaction.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        failureReason:
          "Voided by an admin: this credit had no verified KoraPay transaction behind it and predates payment verification.",
      },
    });
    await tx.user.update({
      where: { id: row.userId },
      data: { walletBalanceKobo: { decrement: row.amountKobo } },
    });

    return { voided: true, amountKobo: row.amountKobo, userId: row.userId };
  });
}

export type TopUpOutcome =
  | { state: "credited" }
  | { state: "failed" }
  | { state: "still_pending" }
  | { state: "unknown_reference" };

/**
 * Asks KoraPay directly what a charge's status actually is, and settles
 * our own row to match. This is the one function both the webhook and the
 * customer's redirect back from checkout call: a webhook event or a
 * `?reference=` query parameter only ever says which reference to check,
 * never what happened to it, so calling this twice for the same reference
 * (webhook and return page racing each other, or a retried webhook) is
 * safe and simply does nothing the second time, since completeTopUp() and
 * settleFailedTopUp() are both idempotent against a row that already left
 * PENDING.
 */
export async function verifyAndSettleTopUp(providerReference: string): Promise<TopUpOutcome> {
  const row = await prisma.walletTransaction.findUnique({ where: { providerReference } });
  if (!row) return { state: "unknown_reference" };
  if (row.status === "SUCCESSFUL") return { state: "credited" };
  if (row.status !== "PENDING") return { state: "failed" };

  let charge;
  try {
    charge = await verifyKorapayCharge(providerReference);
  } catch (error) {
    if (error instanceof KorapayError) {
      console.error(`[funding] KoraPay verify failed for ${providerReference}:`, error.message);
      return { state: "still_pending" };
    }
    throw error;
  }

  if (charge.status === "success") {
    const result = await completeTopUp(providerReference, charge.providerTransactionId);
    return { state: result.credited || result.reason === "already_credited" ? "credited" : "failed" };
  }
  if (charge.status === "failed" || charge.status === "expired") {
    await settleFailedTopUp(providerReference, "FAILED", `KoraPay reported "${charge.status}"`);
    return { state: "failed" };
  }
  return { state: "still_pending" };
}
