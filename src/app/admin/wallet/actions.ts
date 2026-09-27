"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { voidUnverifiedTopup, verifyAndSettleTopUp } from "@/lib/funding";
import { recordAudit } from "@/lib/audit";

export interface VoidTopupResult {
  error?: string;
  success?: boolean;
}

/**
 * The one remediation this admin panel offers for a legacy credit that
 * predates payment verification: reverse it. Deliberately narrow —
 * voidUnverifiedTopup() itself refuses anything that isn't exactly that
 * failure mode, so this can never be used to alter a real payment, a
 * purchase, a refund, or an adjustment, whatever id is passed in.
 */
export async function voidUnverifiedTopupAction(
  transactionId: string,
): Promise<VoidTopupResult> {
  const admin = await requireAdmin();

  const result = await voidUnverifiedTopup(transactionId);
  if (!result.voided) {
    return {
      error:
        result.reason === "not_found"
          ? "That transaction no longer exists."
          : "This is not an unverified top up; nothing was changed.",
    };
  }

  await recordAudit({
    actor: admin,
    action: "wallet.void_unverified_topup",
    targetType: "wallet_transaction",
    targetId: transactionId,
    metadata: { amountKobo: result.amountKobo, userId: result.userId },
  });

  revalidatePath("/admin/wallet");
  revalidatePath(`/admin/wallet/${transactionId}`);
  revalidatePath(`/admin/users/${result.userId}`);
  return { success: true };
}

export interface RecheckTopupResult {
  error?: string;
  outcome?: "credited" | "failed" | "still_pending";
}

/**
 * A stuck PENDING top up an admin needs to nudge, without waiting on
 * Korapay's own webhook retries or the customer happening to reload their
 * wallet page. Calls exactly the same verifyAndSettleTopUp() the webhook
 * and the customer's own return-from-checkout use — never credits from
 * anything this admin (or the browser) supplies, only from what Korapay's
 * API confirms for this reference right now. Safe to click any number of
 * times: a transaction that already left PENDING is a no-op here, same as
 * every other caller of verifyAndSettleTopUp().
 */
export async function recheckPendingTopupAction(
  transactionId: string,
): Promise<RecheckTopupResult> {
  const admin = await requireAdmin();

  const tx = await prisma.walletTransaction.findUnique({ where: { id: transactionId } });
  if (!tx) return { error: "That transaction no longer exists." };
  if (tx.type !== "TOPUP" || tx.status !== "PENDING" || !tx.providerReference) {
    return { error: "This is not a pending top up with a payment provider reference." };
  }

  const result = await verifyAndSettleTopUp(tx.providerReference);

  await recordAudit({
    actor: admin,
    action: "wallet.recheck_pending_topup",
    targetType: "wallet_transaction",
    targetId: transactionId,
    metadata: { providerReference: tx.providerReference, outcome: result.state },
  });

  revalidatePath("/admin/wallet");
  revalidatePath(`/admin/wallet/${transactionId}`);
  revalidatePath(`/admin/users/${tx.userId}`);

  if (result.state === "unknown_reference") {
    return { error: "Korapay does not recognize this reference." };
  }
  return { outcome: result.state };
}
