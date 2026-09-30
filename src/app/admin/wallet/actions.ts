"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { voidUnverifiedTopup, reconcileTopUp } from "@/lib/funding";
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
 * wallet page. Calls exactly the same reconcileTopUp() the webhook and the
 * customer's own return-from-checkout use, with the ADMIN_MANUAL trigger —
 * never credits from anything this admin (or the browser) supplies, only
 * from what Korapay's API confirms for this reference right now, and always
 * actually calls KoraPay (an explicit admin click is never throttled by the
 * backoff that protects against a page merely rendering). Safe to click any
 * number of times: a transaction that already left PENDING is a no-op here,
 * same as every other caller of reconcileTopUp(). Every attempt — credited,
 * still pending, or a KoraPay error — is recorded on PaymentVerificationLog
 * with this admin's id, visible on the transaction's own page.
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

  const result = await reconcileTopUp(tx.providerReference, "ADMIN_MANUAL", admin);

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
