"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createPendingTopUp } from "@/lib/funding";
import {
  validateTopUpAmount,
  FUNDING_ERROR_COPY,
  type FundingError,
} from "@/lib/funding-limits";

export interface StartTopUpResult {
  error?: string;
  /** Our reference for the pending attempt, which the payment provider
   *  will be given once Korapay is connected. */
  reference?: string;
  amountKobo?: number;
}

/**
 * Begins a funding attempt.
 *
 * Records the intent and stops there. No balance moves, because no money
 * has arrived: the customer has told us what they want to pay, not paid
 * it. Crediting happens only in completeTopUp(), after Korapay confirms
 * the payment server side.
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

  revalidatePath("/dashboard/wallet");

  return {
    reference: pending.providerReference ?? undefined,
    amountKobo: pending.amountKobo,
  };
}
