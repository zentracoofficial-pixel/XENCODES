"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { voidUnverifiedTopup } from "@/lib/funding";
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
