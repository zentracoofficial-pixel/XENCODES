"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAudit } from "@/lib/audit";
import {
  adminForceRefundActivation,
  reconcileActivation,
  type AdminRefundReason,
} from "@/lib/activation-lifecycle";

export interface AdminRefundActionResult {
  error?: string;
  success?: boolean;
}

/**
 * The admin panel's "Refund" button. Never a bare wallet credit from the
 * click alone: adminForceRefundActivation() re-verifies the order against
 * the provider first (the same real check a customer's own poll would run)
 * and only forces a refund if that check leaves it genuinely still pending.
 * Strict eligibility is enforced there, atomically, not here — this is only
 * the auth boundary and the audit trail.
 */
export async function adminRefundActivationAction(
  activationId: string,
  reason: AdminRefundReason,
  note: string,
): Promise<AdminRefundActionResult> {
  const admin = await requireAdmin();

  const result = await adminForceRefundActivation(
    activationId,
    { reason, note: note.trim() || undefined },
    { id: admin.id, email: admin.email },
  );

  if (!result.ok) {
    return { error: result.reason };
  }

  await recordAudit({
    actor: admin,
    action: "order.admin_refund",
    targetType: "activation",
    targetId: activationId,
    metadata: { reason, note: note.trim() || null },
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${activationId}`);
  return { success: true };
}

export interface AdminRecheckResult {
  error?: string;
  status?: string;
}

/**
 * A lighter "just check, don't force anything" action for a WAITING order:
 * the admin equivalent of the customer's own polling, useful when an admin
 * wants to know right now whether a code actually arrived before deciding
 * whether to refund at all.
 */
export async function adminRecheckActivationAction(
  activationId: string,
): Promise<AdminRecheckResult> {
  await requireAdmin();

  const result = await reconcileActivation(activationId, "ADMIN_MANUAL_CHECK");
  if (!result) return { error: "That order no longer exists." };

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${activationId}`);
  return { status: result.status };
}
