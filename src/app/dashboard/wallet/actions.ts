"use server";

import { revalidatePath } from "next/cache";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createPendingTopUp, settleFailedTopUp, verifyAndSettleTopUp } from "@/lib/funding";
import {
  validateTopUpAmount,
  calculateTopupFeeKobo,
  FUNDING_ERROR_COPY,
  type FundingError,
} from "@/lib/funding-limits";
import {
  readSettings,
  readNumber,
  SETTING_KEYS,
  DEFAULT_TOPUP_FEE_PERCENT,
  DEFAULT_TOPUP_FEE_CAP_KOBO,
} from "@/lib/settings";
import { initializeKorapayCharge, isKorapayConfigured, KorapayError } from "@/lib/korapay";

export interface StartTopUpResult {
  error?: string;
  /** Our reference for the pending attempt, kept so the wallet page can
   *  poll it after a checkout redirect. */
  reference?: string;
  /** What lands in the wallet once verified. Never includes the fee. */
  amountKobo?: number;
  /** KoraPay's processing fee, charged on top, for display. */
  feeKobo?: number;
  /** What KoraPay actually charges the customer: amountKobo + feeKobo. */
  totalChargedKobo?: number;
  /** Set only when KoraPay is connected: the browser is sent here to pay.
   *  Absent means the request was recorded but there is nowhere to send
   *  the customer yet, which the UI shows plainly rather than pretending
   *  a checkout is coming. */
  checkoutUrl?: string;
}

/**
 * Begins a funding attempt.
 *
 * Records the intent and stops there: no balance moves, because no money
 * has arrived yet. When KoraPay is connected this also asks it to open a
 * checkout page and hands back the URL for the browser to go pay at;
 * crediting still only ever happens in completeTopUp(), after that
 * payment is verified server side, never here.
 *
 * An earlier version of this called creditWallet() directly, which meant
 * clicking a top up amount granted balance for free. That is the specific
 * behaviour this replaces.
 */
export async function startTopUpAction(amountKobo: number): Promise<StartTopUpResult> {
  // A suspended or "deleted" account keeps a valid JWT until it expires on
  // its own; this is what actually stops it from starting a funding
  // attempt in the meantime, since session.user.id alone would not.
  const user = await getActiveUser();
  if (!user) {
    return { error: FUNDING_ERROR_COPY.not_authenticated };
  }

  const invalid: FundingError | null = validateTopUpAmount(amountKobo);
  if (invalid) return { error: FUNDING_ERROR_COPY[invalid] };

  const pending = await createPendingTopUp(user.id, amountKobo);
  const reference = pending.providerReference ?? undefined;

  // The fee is computed from settings at charge time, not stored on the
  // pending row: WalletTransaction.amountKobo is what completeTopUp()
  // credits to the wallet once verified, and must stay exactly what the
  // customer asked for. The fee only ever affects what KoraPay is asked
  // to charge at checkout, never what lands in the balance.
  const settings = await readSettings();
  const feePercent = readNumber(settings, SETTING_KEYS.topupFeePercent, DEFAULT_TOPUP_FEE_PERCENT);
  const feeCapKobo = readNumber(settings, SETTING_KEYS.topupFeeCapKobo, DEFAULT_TOPUP_FEE_CAP_KOBO);
  const feeKobo = calculateTopupFeeKobo(pending.amountKobo, feePercent, feeCapKobo);
  const totalChargedKobo = pending.amountKobo + feeKobo;

  if (!isKorapayConfigured() || !reference) {
    revalidatePath("/dashboard/wallet");
    return { reference, amountKobo: pending.amountKobo, feeKobo, totalChargedKobo };
  }

  try {
    const { checkoutUrl } = await initializeKorapayCharge({
      reference,
      amountKobo: totalChargedKobo,
      email: user.email,
      name: user.name,
    });
    revalidatePath("/dashboard/wallet");
    return { reference, amountKobo: pending.amountKobo, feeKobo, totalChargedKobo, checkoutUrl };
  } catch (error) {
    // Logged, not just recorded on the row: this is the one place a real
    // KoraPay rejection reason (bad credentials, a malformed field, an
    // account not yet enabled for a channel) is visible at all, since the
    // customer is deliberately shown a generic message rather than a raw
    // provider error.
    console.error(`[wallet] KoraPay checkout failed to start for ${reference}:`, error);
    // The request was never opened at KoraPay's end, so there is nothing
    // to reconcile later: close it out now rather than leaving a pending
    // row a customer can never actually pay. CANCELLED, not FAILED: the
    // customer never saw a checkout page or attempted a payment here, so
    // this should not read as "your payment failed" in their history.
    await settleFailedTopUp(
      reference,
      "CANCELLED",
      error instanceof KorapayError ? error.message : "Failed to start checkout.",
    );
    revalidatePath("/dashboard/wallet");
    return { error: "We could not start checkout. Nothing was charged; please try again." };
  }
}

export interface TopUpStatus {
  state: "credited" | "failed" | "still_pending" | "unknown_reference";
}

/**
 * Called when the customer lands back on the wallet page from KoraPay's
 * checkout, so they see the outcome immediately rather than waiting on
 * the webhook. Safe to call any number of times for the same reference:
 * verifyAndSettleTopUp() only ever acts once on a row that leaves PENDING.
 */
export async function checkTopUpStatusAction(reference: string): Promise<TopUpStatus> {
  const user = await getActiveUser();
  if (!user) return { state: "unknown_reference" };

  const row = await prisma.walletTransaction.findFirst({
    where: { providerReference: reference, userId: user.id },
  });
  if (!row) return { state: "unknown_reference" };

  const outcome = await verifyAndSettleTopUp(reference);
  revalidatePath("/dashboard/wallet");
  return { state: outcome.state };
}
