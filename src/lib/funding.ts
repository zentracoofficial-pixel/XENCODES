import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { WalletTransaction } from "@/generated/prisma/client";
import { FUNDING_PROVIDER, validateTopUpAmount } from "@/lib/funding-limits";
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
  FUNDING_PROVIDER,
  fundingErrorCopy,
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
  /** ISO 4217, the account's own currency. amountKobo is in this currency's
   *  minor unit, never assumed to be Naira. */
  currency: string,
  minTopUpMinor: number,
  maxTopUpMinor: number,
): Promise<WalletTransaction> {
  const invalid = validateTopUpAmount(amountKobo, minTopUpMinor, maxTopUpMinor);
  if (invalid) throw new Error(invalid);

  return prisma.walletTransaction.create({
    data: {
      userId,
      type: "TOPUP",
      amountKobo,
      currency,
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
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.walletTransaction.findUnique({
      where: { providerReference },
    });

    if (!row) return { credited: false, reason: "unknown_reference" };
    if (row.type !== "TOPUP") return { credited: false, reason: "not_a_topup" };

    // Atomic compare-and-swap: the status guard lives in the UPDATE's own
    // WHERE clause, not in a separate read beforehand. The webhook and the
    // customer's own return-from-checkout check both call this function
    // for the same reference and can genuinely run concurrently; a plain
    // "read status, then write" here would let both see PENDING before
    // either commits and both credit the wallet, doubling a real payment.
    // Only the caller whose UPDATE actually matches a still-PENDING row at
    // the moment it runs proceeds to credit anything.
    const flipped = await tx.walletTransaction.updateMany({
      where: { providerReference, status: "PENDING" },
      data: {
        status: "SUCCESSFUL",
        completedAt: new Date(),
        providerTransactionId: providerTransactionId ?? row.providerTransactionId,
      },
    });

    if (flipped.count === 0) {
      // Someone else already moved it (or it was never PENDING); re-read
      // to report which, without crediting anything here.
      const current = await tx.walletTransaction.findUnique({ where: { providerReference } });
      if (current?.status === "SUCCESSFUL") return { credited: false, reason: "already_credited" };
      return { credited: false, reason: `cannot_complete_from_${current?.status ?? row.status}` };
    }

    await tx.user.update({
      where: { id: row.userId },
      data: { walletBalanceKobo: { increment: row.amountKobo } },
    });

    return { credited: true, walletTransactionId: row.id };
  });

  // Deliberately does NOT call notifyWalletFundingSale() here. KoraPay
  // already sends its own funding notification for a successful charge, so
  // a second, Xencodes-internal sales email for the same event would just
  // be a duplicate that spends Resend quota for nothing. Number purchases
  // are a separate event with no equivalent third-party notification —
  // see notifyNumberPurchaseSale() in purchaseNumberAction(), which is
  // unaffected by this and keeps sending.

  return { credited: result.credited, reason: result.reason };
}

/**
 * Closes out a funding attempt that will not complete. Never touches the
 * balance, because a pending top up never contributed to it.
 *
 * The PENDING guard is in the UPDATE's own WHERE clause, atomically, for
 * the same reason completeTopUp()'s is: this can race a concurrent
 * completeTopUp() call for the same reference, and a plain "read then
 * write" could let this stomp a row completeTopUp() had just (correctly)
 * moved to SUCCESSFUL back down to FAILED, leaving a credited wallet next
 * to a ledger row that claims the payment failed.
 */
export async function settleFailedTopUp(
  providerReference: string,
  status: "FAILED" | "CANCELLED",
  failureReason?: string,
) {
  await prisma.walletTransaction.updateMany({
    where: { providerReference, status: "PENDING" },
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

    // Atomic guard, matching the pattern above: an admin double-clicking
    // "void" (or two admins acting on the same stale row at once) must not
    // be able to decrement the wallet twice for one bad credit.
    const flipped = await tx.walletTransaction.updateMany({
      where: { id: transactionId, status: "SUCCESSFUL", providerTransactionId: null },
      data: {
        status: "FAILED",
        failureReason:
          "Voided by an admin: this credit had no verified KoraPay transaction behind it and predates payment verification.",
      },
    });
    if (flipped.count === 0) {
      return { voided: false, reason: "not_an_unverified_topup" };
    }

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
  | {
      state: "still_pending";
      /** Why KoraPay was not able to confirm this one just now, for the
       *  reconciliation log below. Absent means "asked KoraPay, it genuinely
       *  said pending" — the ordinary case. */
      reason?: "provider_unavailable" | "amount_mismatch" | "currency_mismatch";
    }
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
 *
 * Low-level: never call this directly for anything triggered by a page view
 * or a sweep. It always calls KoraPay's API, with no backoff and no
 * reconciliation-log entry — see reconcileTopUp() below, which wraps this
 * with both and is what every caller outside the webhook should use.
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
      return { state: "still_pending", reason: "provider_unavailable" };
    }
    throw error;
  }

  if (charge.status === "success") {
    // Best-effort cross-check: only compared when KoraPay's response
    // actually includes the field (see ChargeStatusResult's own comment on
    // why this is optional rather than assumed). A confirmed mismatch is
    // never silently credited at the wrong figure; it is left PENDING for
    // manual review instead, since crediting the pending row's own amount
    // when KoraPay itself reports a different one charged would credit a
    // customer more or less than they actually paid.
    if (charge.amountKobo !== undefined && charge.amountKobo !== row.amountKobo) {
      console.error(
        `[funding] refusing to credit ${providerReference}: KoraPay confirmed ${charge.amountKobo} kobo but the pending request was for ${row.amountKobo} kobo.`,
      );
      return { state: "still_pending", reason: "amount_mismatch" };
    }
    if (charge.currency !== undefined && charge.currency !== row.currency) {
      console.error(
        `[funding] refusing to credit ${providerReference}: KoraPay confirmed currency "${charge.currency}", expected "${row.currency}".`,
      );
      return { state: "still_pending", reason: "currency_mismatch" };
    }

    const result = await completeTopUp(providerReference, charge.providerTransactionId);
    return { state: result.credited || result.reason === "already_credited" ? "credited" : "failed" };
  }
  if (charge.status === "failed") {
    // A real payment attempt that KoraPay declined: this is worth keeping
    // visible in the customer's own history, since money was actually
    // attempted for it.
    await settleFailedTopUp(providerReference, "FAILED", `KoraPay reported "failed"`);
    return { state: "failed" };
  }
  if (charge.status === "expired") {
    // The checkout link timed out without the customer ever completing (or
    // in many cases even starting) a payment attempt. CANCELLED, not
    // FAILED, so it can be told apart from a real declined payment and kept
    // out of the customer's transaction history.
    await settleFailedTopUp(providerReference, "CANCELLED", `KoraPay reported "expired"`);
    return { state: "failed" };
  }
  return { state: "still_pending" };
}

/** Where a call to reconcileTopUp() originated, for the reconciliation log
 *  and for deciding whether backoff applies (see BACKOFF_TRIGGERS below). */
export type VerificationTrigger =
  | "WEBHOOK"
  | "RETURN_REDIRECT"
  | "USER_VIEW"
  | "ADMIN_MANUAL"
  | "RECONCILIATION_SWEEP";

/** Triggers that represent one specific, meaningful real-world event
 *  (KoraPay's own webhook, or a customer actually arriving back from
 *  checkout) always run, however recently this reference was last checked.
 *  Everything else — a customer's dashboard simply rendering, or the
 *  periodic sweep — is throttled below, since those can otherwise fire far
 *  more often than KoraPay needs to be asked. */
const BACKOFF_TRIGGERS = new Set<VerificationTrigger>(["USER_VIEW", "RECONCILIATION_SWEEP"]);
const AUTOMATIC_VERIFICATION_BACKOFF_MS = 20_000;

/**
 * The one function every caller other than verifyAndSettleTopUp's own
 * internal use should call: the same idempotent verification, plus backoff
 * bookkeeping and an entry in PaymentVerificationLog so a stuck payment has
 * a visible trail (what was checked, when, by what trigger, with what
 * result) instead of only a server log line.
 *
 * Conceptually the "processVerifiedFunding" every code path converges on:
 * the webhook, the customer's return-from-checkout, a customer's dashboard
 * noticing an older pending row, an admin's manual "Verify" click, and the
 * reconciliation sweep piggybacked on the daily provider-sync cron all call
 * this, never verifyAndSettleTopUp() directly (except that function calling
 * itself, and the webhook route, which is itself one of this function's
 * triggers).
 */
export async function reconcileTopUp(
  providerReference: string,
  trigger: VerificationTrigger,
  admin?: { id: string; email: string },
): Promise<TopUpOutcome> {
  const row = await prisma.walletTransaction.findUnique({ where: { providerReference } });
  if (!row) return { state: "unknown_reference" };
  if (row.status !== "PENDING") {
    return row.status === "SUCCESSFUL" ? { state: "credited" } : { state: "failed" };
  }

  if (BACKOFF_TRIGGERS.has(trigger) && row.lastVerificationAttemptAt) {
    const elapsedMs = Date.now() - row.lastVerificationAttemptAt.getTime();
    if (elapsedMs < AUTOMATIC_VERIFICATION_BACKOFF_MS) {
      // Skipped entirely: no KoraPay call, no log row. A page render or a
      // sweep landing here again seconds later should not itself become
      // more noise than the situation it is trying to observe.
      return { state: "still_pending" };
    }
  }

  await prisma.walletTransaction.update({
    where: { id: row.id },
    data: { lastVerificationAttemptAt: new Date(), verificationAttempts: { increment: 1 } },
  });

  const outcome = await verifyAndSettleTopUp(providerReference);

  const result: import("@/generated/prisma/client").PaymentVerificationResult =
    outcome.state === "credited"
      ? "CREDITED"
      : outcome.state === "failed"
        ? "FAILED"
        : outcome.state === "unknown_reference"
          ? "UNKNOWN_REFERENCE"
          : outcome.reason === "provider_unavailable"
            ? "PROVIDER_UNAVAILABLE"
            : outcome.reason === "amount_mismatch" || outcome.reason === "currency_mismatch"
              ? "MISMATCH"
              : "STILL_PENDING";

  await prisma.paymentVerificationLog
    .create({
      data: {
        walletTransactionId: row.id,
        trigger,
        result,
        failureReason:
          outcome.state === "still_pending" && outcome.reason
            ? outcome.reason
            : undefined,
        adminId: admin?.id,
        adminEmail: admin?.email,
      },
    })
    // Never lets a logging failure undo a real verification result: the
    // credit (or lack of one) above has already happened by this point.
    .catch((error) => console.error(`[funding] failed to log verification for ${providerReference}:`, error));

  return outcome;
}

/** A PENDING top up younger than this was very likely created moments ago by
 *  a customer mid-checkout; the sweep leaves it alone so as not to compete
 *  with the webhook and return-redirect paths that are the normal way that
 *  one settles. Older than this, those normal paths have had a fair chance
 *  and this is exactly the "webhook missed" case reconciliation exists for. */
const SWEEP_MIN_AGE_MS = 10 * 60 * 1000;
/** A PENDING top up older than this has not been worth asking KoraPay about
 *  for a long time — almost certainly an abandoned checkout, not a payment
 *  quietly waiting to clear. Left PENDING (never guessed at as FAILED
 *  without KoraPay actually saying so), just no longer swept automatically;
 *  an admin can still recheck it by hand from /admin/wallet at any time. */
const SWEEP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Bounds one sweep's worst-case KoraPay calls, since this runs inside the
 *  existing 60-second-capped cron alongside the catalog sync (see
 *  maxDuration in the cron route) and must leave it headroom. */
const SWEEP_BATCH_SIZE = 25;

/**
 * The other half of "the server should notice a missed webhook on its own":
 * a bounded, backed-off sweep of old PENDING top ups, run once a day from
 * the existing provider-sync cron rather than a dedicated one (a Hobby-plan
 * Vercel project cannot declare a more frequent cron at all). Each row still
 * goes through reconcileTopUp() with the RECONCILIATION_SWEEP trigger, so it
 * gets the same backoff, idempotent crediting, and log entry as every other
 * caller — this just decides which references are worth asking about today.
 */
export async function sweepPendingTopUps(): Promise<{ checked: number }> {
  const now = Date.now();
  const candidates = await prisma.walletTransaction.findMany({
    where: {
      type: "TOPUP",
      status: "PENDING",
      providerReference: { not: null },
      createdAt: {
        lte: new Date(now - SWEEP_MIN_AGE_MS),
        gte: new Date(now - SWEEP_MAX_AGE_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH_SIZE,
    select: { providerReference: true },
  });

  for (const row of candidates) {
    if (!row.providerReference) continue;
    await reconcileTopUp(row.providerReference, "RECONCILIATION_SWEEP").catch((error) =>
      console.error(`[funding] sweep failed for ${row.providerReference}:`, error),
    );
  }

  return { checked: candidates.length };
}
