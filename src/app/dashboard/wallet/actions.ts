"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createPendingTopUp, settleFailedTopUp, verifyAndSettleTopUp } from "@/lib/funding";
import { validateTopUpAmount, FUNDING_ERROR_COPY, type FundingError } from "@/lib/funding-limits";
import { initializeKorapayCharge, isKorapayConfigured, KorapayError } from "@/lib/korapay";

export interface StartTopUpResult {
  error?: string;
  /** Our reference for the pending attempt, kept so the wallet page can
   *  poll it after a checkout redirect. */
  reference?: string;
  /** What lands in the wallet once verified. KoraPay's own processing fee
   *  (see initializeKorapayCharge's merchant_bears_cost) is added on top of
   *  this at checkout and is never part of it. */
  amountKobo?: number;
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
  const session = await auth();
  if (!session?.user?.id) {
    return { error: FUNDING_ERROR_COPY.not_authenticated };
  }

  const invalid: FundingError | null = validateTopUpAmount(amountKobo);
  if (invalid) return { error: FUNDING_ERROR_COPY[invalid] };

  const pending = await createPendingTopUp(session.user.id, amountKobo);
  const reference = pending.providerReference ?? undefined;

  if (!isKorapayConfigured() || !reference) {
    revalidatePath("/dashboard/wallet");
    return { reference, amountKobo: pending.amountKobo };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });

  try {
    // KoraPay is asked for exactly the amount the wallet will be credited.
    // initializeKorapayCharge() tells KoraPay to add its own real
    // transaction fee on top and collect that from the customer directly,
    // so this business never pays it and never has to guess at it.
    const { checkoutUrl } = await initializeKorapayCharge({
      reference,
      amountKobo: pending.amountKobo,
      email: user?.email ?? session.user.email ?? "",
      name: user?.name,
    });
    revalidatePath("/dashboard/wallet");
    return { reference, amountKobo: pending.amountKobo, checkoutUrl };
  } catch (error) {
    // Logged, not just recorded on the row: this is the one place a real
    // KoraPay rejection reason (bad credentials, a malformed field, an
    // account not yet enabled for a channel) is visible at all, since the
    // customer is deliberately shown a generic message rather than a raw
    // provider error.
    console.error(`[wallet] KoraPay checkout failed to start for ${reference}:`, error);
    // The request was never opened at KoraPay's end, so there is nothing
    // to reconcile later: close it out now rather than leaving a pending
    // row a customer can never actually pay.
    await settleFailedTopUp(
      reference,
      "FAILED",
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
  const session = await auth();
  if (!session?.user?.id) return { state: "unknown_reference" };

  const row = await prisma.walletTransaction.findFirst({
    where: { providerReference: reference, userId: session.user.id },
  });
  if (!row) return { state: "unknown_reference" };

  const outcome = await verifyAndSettleTopUp(reference);
  revalidatePath("/dashboard/wallet");
  return { state: outcome.state };
}
