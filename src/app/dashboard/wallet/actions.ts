"use server";

import { revalidatePath } from "next/cache";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createPendingTopUp, settleFailedTopUp, reconcileTopUp } from "@/lib/funding";
import {
  validateTopUpAmount,
  calculateTopupFeeKobo,
  fundingErrorCopy,
  type FundingError,
} from "@/lib/funding-limits";
import {
  readSettings,
  readNumber,
  SETTING_KEYS,
  DEFAULT_TOPUP_FEE_PERCENT,
} from "@/lib/settings";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";
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
    return { error: fundingErrorCopy("not_authenticated", "NGN", 0, 0) };
  }

  const currency = (await getCurrencyConfig(user.currency)) ?? (await getDefaultCurrency());

  // Two different facts, not one: `fundingProvider` is whether any adapter
  // exists in code at all for this currency (USD: none yet, structurally,
  // regardless of environment variables); `fundingAvailable` is whether
  // that adapter is actually configured on this deployment right now. A
  // currency with no adapter is refused outright, with no row created at
  // all, rather than recorded as a pending request that could never be
  // completed by any deployment configuration change.
  if (!currency.fundingProvider) {
    return {
      error: `${currency.code} funding is not available on Xencodes yet. You can still browse and see prices in ${currency.code}.`,
    };
  }

  const invalid: FundingError | null = validateTopUpAmount(
    amountKobo,
    currency.minTopUpMinor,
    currency.maxTopUpMinor,
  );
  if (invalid) {
    return {
      error: fundingErrorCopy(invalid, currency.code, currency.minTopUpMinor, currency.maxTopUpMinor),
    };
  }

  const pending = await createPendingTopUp(
    user.id,
    amountKobo,
    currency.code,
    currency.minTopUpMinor,
    currency.maxTopUpMinor,
  );
  const reference = pending.providerReference ?? undefined;

  // The fee is computed at charge time, not stored on the pending row:
  // WalletTransaction.amountKobo is what completeTopUp() credits to the
  // wallet once verified, and must stay exactly what the customer asked
  // for. The fee only ever affects what KoraPay is asked to charge at
  // checkout, never what lands in the balance. The percent is still a
  // single platform-wide setting (KoraPay's own rate does not vary by
  // currency); the cap is per-currency, from this account's own currency
  // config, the same way the top-up bounds above are.
  const settings = await readSettings();
  const feePercent = readNumber(settings, SETTING_KEYS.topupFeePercent, DEFAULT_TOPUP_FEE_PERCENT);
  const feeKobo = calculateTopupFeeKobo(pending.amountKobo, feePercent, currency.feeCapMinor);
  const totalChargedKobo = pending.amountKobo + feeKobo;

  if (!isKorapayConfigured() || !reference) {
    revalidatePath("/dashboard/wallet");
    return { reference, amountKobo: pending.amountKobo, feeKobo, totalChargedKobo };
  }

  try {
    const { checkoutUrl } = await initializeKorapayCharge({
      reference,
      amountKobo: totalChargedKobo,
      currency: currency.code,
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
 * reconcileTopUp() only ever credits once on a row that leaves PENDING, and
 * this specific trigger always actually asks KoraPay (no backoff), since it
 * only ever fires once per real checkout return, not on every render.
 */
export async function checkTopUpStatusAction(reference: string): Promise<TopUpStatus> {
  const user = await getActiveUser();
  if (!user) return { state: "unknown_reference" };

  const row = await prisma.walletTransaction.findFirst({
    where: { providerReference: reference, userId: user.id },
  });
  if (!row) return { state: "unknown_reference" };

  const outcome = await reconcileTopUp(reference, "RETURN_REDIRECT");
  revalidatePath("/dashboard/wallet");
  return { state: outcome.state };
}

/**
 * Opportunistic reconciliation for a top up that never got a checkout
 * return to trigger checkTopUpStatusAction() above — the case a bank
 * transfer settles after the customer already left KoraPay's checkout page,
 * or a webhook silently failed to arrive. Called from the wallet page on
 * every load for the signed-in customer's own PENDING top ups; backed off
 * per row (USER_VIEW trigger) so a customer refreshing repeatedly does not
 * turn every page view into a fresh KoraPay call.
 *
 * Capped at the 3 most recent pending rows so a customer who has walked
 * away from many failed attempts cannot make their own page load slow by
 * fanning out into many KoraPay calls at once.
 */
export async function reconcileStalePendingTopUpsAction(): Promise<void> {
  const user = await getActiveUser();
  if (!user) return;

  const pending = await prisma.walletTransaction.findMany({
    where: { userId: user.id, type: "TOPUP", status: "PENDING", providerReference: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { providerReference: true },
  });

  for (const row of pending) {
    if (!row.providerReference) continue;
    await reconcileTopUp(row.providerReference, "USER_VIEW").catch((error) =>
      console.error(`[wallet] background reconciliation failed for ${row.providerReference}:`, error),
    );
  }
}
