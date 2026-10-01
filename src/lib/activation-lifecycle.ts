import { prisma } from "@/lib/prisma";
import { resolveProvider } from "@/lib/provider";
import { creditWallet } from "@/lib/wallet";
import { notifyNumberPurchaseSale } from "@/lib/sales-notification";
import { evaluateNoCodeRecovery, resolveRecoveryOnSuccess } from "@/lib/recovery";
import type { ActivationRefundReason } from "@/generated/prisma/client";

/**
 * The number-activation lifecycle: settling a WAITING order into whatever it
 * actually became, exactly once, from whichever of four places notices.
 *
 * The financial rule this file exists to enforce: a customer pays for a
 * number only when its code actually arrives. purchaseNumberAction() (see
 * src/app/dashboard/buy/actions.ts) already debits the wallet the moment a
 * number is issued — issuance itself is the usage event, counted the moment
 * the Activation row is created and never re-counted by anything that polls
 * it afterward, since nothing here ever creates a second row for the same
 * order. Settling WAITING into RECEIVED keeps that charge; settling it into
 * anything else (EXPIRED, CANCELLED, provider-REFUNDED) reverses it, in full,
 * using the exact priceKobo stored on the order at purchase time — never the
 * provider's USD cost, never a price recomputed today.
 *
 * Four callers all converge on reconcileActivation() below, the same way
 * every funding trigger converges on reconcileTopUp() in src/lib/funding.ts:
 * the customer's own activation page polling it live, an admin passively
 * viewing a stuck order, an admin's explicit pre-refund check, and the
 * bounded sweep piggybacked on the daily cron. Whichever one actually flips
 * the row out of WAITING is the only one that ever credits anything — the
 * atomic `updateMany({ where: { status: "WAITING" } })` guard below is what
 * makes a duplicate provider status, a retried poll, or two workers racing
 * the same activation all resolve to exactly one settlement.
 */

export interface ActivationState {
  id: string;
  serviceSlug: string;
  serviceName: string;
  countryName: string;
  phoneNumber: string;
  priceKobo: number;
  /** ISO 4217; the currency priceKobo is denominated in. */
  currency: string;
  status: "WAITING" | "RECEIVED" | "EXPIRED" | "CANCELLED" | "REFUNDED";
  code: string | null;
  expiresAt: string;
  createdAt: string;
  receivedAt: string | null;
}

interface ActivationRow {
  id: string;
  serviceSlug: string;
  serviceName: string;
  countryName: string;
  phoneNumber: string;
  priceKobo: number;
  currency: string;
  status: string;
  code: string | null;
  expiresAt: Date;
  createdAt: Date;
  receivedAt: Date | null;
}

export function toActivationState(activation: ActivationRow): ActivationState {
  return {
    id: activation.id,
    serviceSlug: activation.serviceSlug,
    serviceName: activation.serviceName,
    countryName: activation.countryName,
    phoneNumber: activation.phoneNumber,
    priceKobo: activation.priceKobo,
    currency: activation.currency,
    status: activation.status as ActivationState["status"],
    code: activation.code,
    expiresAt: activation.expiresAt.toISOString(),
    createdAt: activation.createdAt.toISOString(),
    receivedAt: activation.receivedAt?.toISOString() ?? null,
  };
}

/** Where a call to reconcileActivation() originated. CUSTOMER_POLL and
 *  ADMIN_MANUAL_CHECK represent one specific, deliberate real-world check
 *  and always ask the provider; CUSTOMER_VIEW and ADMIN_VIEW (a page simply
 *  rendering) and SWEEP (the periodic batch) are throttled — see
 *  BACKOFF_TRIGGERS. CUSTOMER_VIEW exists separately from ADMIN_VIEW only so
 *  the reconciliation log and server logs say which side actually triggered
 *  the check; both are throttled identically. */
export type ActivationReconcileTrigger =
  | "CUSTOMER_POLL"
  | "CUSTOMER_VIEW"
  | "ADMIN_VIEW"
  | "ADMIN_MANUAL_CHECK"
  | "SWEEP";

const BACKOFF_TRIGGERS = new Set<ActivationReconcileTrigger>(["CUSTOMER_VIEW", "ADMIN_VIEW", "SWEEP"]);
const PROVIDER_CHECK_BACKOFF_MS = 20_000;

export const REFUND_REASON_LABEL: Record<ActivationRefundReason, string> = {
  NO_SMS_RECEIVED: "No SMS received",
  PROVIDER_REFUNDED: "Provider refunded",
  CANCELLED_BY_CUSTOMER: "Cancelled by customer",
  ACTIVATION_EXPIRED: "Activation expired",
  PROVIDER_FAILURE: "Provider failure",
  CUSTOMER_SUPPORT: "Customer support refund",
  OTHER: "Other",
};

/**
 * The one function every path that can settle a WAITING activation calls.
 * A no-op, immediately, for anything not currently WAITING: an activation
 * already RECEIVED, EXPIRED, CANCELLED, or REFUNDED has already been settled
 * (and, for the four no-code outcomes, already refunded, atomically, in the
 * same write that changed its status) — there is nothing left to reconcile.
 */
export async function reconcileActivation(
  activationId: string,
  trigger: ActivationReconcileTrigger,
): Promise<ActivationState | null> {
  const activation = await prisma.activation.findUnique({ where: { id: activationId } });
  if (!activation) return null;
  if (activation.status !== "WAITING") return toActivationState(activation);

  if (BACKOFF_TRIGGERS.has(trigger) && activation.lastProviderStatusCheckAt) {
    const elapsedMs = Date.now() - activation.lastProviderStatusCheckAt.getTime();
    if (elapsedMs < PROVIDER_CHECK_BACKOFF_MS) {
      // Skipped entirely: no provider call, no state change. A page render
      // or the sweep landing here again moments later should not itself
      // turn into more provider traffic than the situation warrants.
      return toActivationState(activation);
    }
  }

  const now = new Date();
  const resolved = await resolveProvider(activation.provider);

  let sms;
  if (resolved.connected && activation.providerOrderId) {
    try {
      sms = await resolved.provider.getOrderStatus(activation.providerOrderId);
    } catch {
      // A supplier hiccup should not settle the order. Keep waiting and let
      // the next check try again; still record that an attempt was made, so
      // backoff-throttled callers do not retry a failing provider call every
      // single time they land here.
      await prisma.activation
        .update({
          where: { id: activation.id },
          data: {
            lastProviderStatusCheckAt: now,
            providerStatusCheckAttempts: { increment: 1 },
          },
        })
        .catch(() => {});
      return toActivationState(activation);
    }
  } else {
    // No supplier to ask. The session still expires on schedule below, so
    // an order left behind by a disconnected supplier is refunded rather
    // than left waiting forever.
    sms = { state: "waiting" } as const;
  }

  await prisma.activation
    .update({
      where: { id: activation.id },
      data: { lastProviderStatusCheckAt: now, providerStatusCheckAttempts: { increment: 1 } },
    })
    .catch(() => {});

  if (sms.state === "received") {
    const flipped = await prisma.activation.updateMany({
      where: { id: activation.id, status: "WAITING" },
      data: { status: "RECEIVED", code: sms.code, receivedAt: now },
    });
    if (flipped.count === 0) {
      // Lost the race to a concurrent settlement — return its real result.
      return toActivationState(await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } }));
    }
    const received = await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } });

    // The sale notification fires here, not at purchase: a reserved number
    // that never delivers a code is a refund, not a sale. Idempotent through
    // SalesNotification's own unique constraint (see notifyNumberPurchaseSale's
    // own comment), so a rare concurrent double-settle still sends once.
    await notifyNumberPurchaseSale(received.id).catch((error) => {
      console.error(`[activation-lifecycle] sales notification failed for ${received.id}:`, error);
    });

    // A code arriving closes out any open "struggling to receive a code"
    // episode for this customer. Never allowed to affect the activation
    // itself: a failure here is logged, not surfaced to the customer.
    await resolveRecoveryOnSuccess(received.userId).catch((error) => {
      console.error(`[activation-lifecycle] recovery resolution failed for ${received.id}:`, error);
    });

    return toActivationState(received);
  }

  // Three different ways an order ends without a code, recorded as three
  // different things and three different refund reasons. The customer is
  // refunded in full either way, but the history should say what actually
  // happened rather than calling every one of them a timeout.
  const settled: { status: "REFUNDED" | "CANCELLED" | "EXPIRED"; reason: ActivationRefundReason; why: string } | null =
    sms.state === "refunded"
      ? { status: "REFUNDED", reason: "PROVIDER_REFUNDED", why: "the provider refunded it" }
      : sms.state === "cancelled"
        ? { status: "CANCELLED", reason: "PROVIDER_REFUNDED", why: "it was cancelled" }
        : sms.state === "expired" || now >= activation.expiresAt
          ? { status: "EXPIRED", reason: "NO_SMS_RECEIVED", why: "no code arrived in time" }
          : null;

  if (!settled) return toActivationState(activation);

  const userId = activation.userId;
  const closed = await prisma.$transaction(async (tx) => {
    // Atomic: only the caller that actually flips this activation out of
    // WAITING gets to credit its refund. Without this guard, two concurrent
    // settlements for the same activation (a poll racing the sweep, two
    // admin views, a retried request) could each read "still WAITING" before
    // either commits and each credit the wallet, refunding one order twice.
    const flipped = await tx.activation.updateMany({
      where: { id: activation.id, status: "WAITING" },
      data: {
        status: settled.status,
        refundReason: settled.reason,
        refundedAt: now,
      },
    });
    if (flipped.count === 0) return null;

    await creditWallet(
      userId,
      activation.priceKobo,
      "REFUND",
      `Refund for ${activation.serviceName}, ${settled.why}`,
      activation.currency,
      activation.id,
      tx,
    );

    return tx.activation.findUniqueOrThrow({ where: { id: activation.id } });
  });

  // Only the caller that actually performed this settlement (not a
  // concurrent one that lost the atomic guard above) evaluates recovery, so
  // polling an already-settled order does not re-run this on every check.
  if (closed) {
    await evaluateNoCodeRecovery(userId).catch((error) => {
      console.error(`[activation-lifecycle] recovery evaluation failed for ${userId}:`, error);
    });
  }

  return toActivationState(closed ?? (await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } })));
}

/** A WAITING activation younger than this was very likely bought moments
 *  ago; the sweep leaves it to the customer's own live polling, which is the
 *  normal and much faster way one settles. Older than this, the session has
 *  long since ended one way or another and this is exactly the "customer
 *  closed the tab and never came back" case the sweep exists for. */
const SWEEP_MIN_AGE_MS = 5 * 60 * 1000;
/** A WAITING row older than this has not been worth sweeping for a long
 *  time — almost certainly an ancient, already-abandoned order from before
 *  this sweep existed. Left WAITING (never guessed at), just no longer swept
 *  automatically; an admin can still act on it by hand from /admin/orders. */
const SWEEP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Bounds one sweep's worst-case provider calls, since this shares the
 *  existing 60-second-capped cron with the catalog sync and the KoraPay
 *  payment sweep and must leave both headroom. */
const SWEEP_BATCH_SIZE = 25;

/**
 * The other half of "the server should notice an abandoned activation on
 * its own": a bounded sweep of old WAITING orders, run once a day from the
 * existing provider-sync cron rather than a dedicated one (a Hobby-plan
 * Vercel project cannot declare a more frequent cron at all). Each row still
 * goes through reconcileActivation() with the SWEEP trigger, so it gets the
 * same backoff, idempotent settlement, and refund as every other caller —
 * this just decides which orders are worth checking today.
 */
export async function sweepPendingActivations(): Promise<{ checked: number }> {
  const now = Date.now();
  const candidates = await prisma.activation.findMany({
    where: {
      status: "WAITING",
      expiresAt: { lt: new Date(now) },
      createdAt: { gte: new Date(now - SWEEP_MAX_AGE_MS) },
      OR: [
        { lastProviderStatusCheckAt: null },
        { lastProviderStatusCheckAt: { lt: new Date(now - SWEEP_MIN_AGE_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH_SIZE,
    select: { id: true },
  });

  for (const row of candidates) {
    await reconcileActivation(row.id, "SWEEP").catch((error) =>
      console.error(`[activation-lifecycle] sweep failed for ${row.id}:`, error),
    );
  }

  return { checked: candidates.length };
}

export type AdminRefundReason = Extract<
  ActivationRefundReason,
  "NO_SMS_RECEIVED" | "ACTIVATION_EXPIRED" | "PROVIDER_FAILURE" | "CUSTOMER_SUPPORT" | "OTHER"
>;

export type AdminRefundResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * An admin's own "Refund" button — never a bare wallet credit, always a
 * verify-then-refund. First runs the exact same reconcileActivation() a
 * customer's own poll would, with ADMIN_MANUAL_CHECK (always asks the
 * provider, never backed off): if the code actually arrived, or the order
 * already settled some other way, this returns that real outcome and
 * refuses to refund anything, since the whole point of checking first is to
 * never credit an order that just turned out to be successful. Only when
 * the provider check leaves the order genuinely still WAITING does this
 * proceed to force a refund under the admin's own explicit reason.
 *
 * Uses the identical atomic `updateMany({ where: { status: "WAITING" } })`
 * guard as every other settlement path, so this can never double-refund an
 * order and can never run at the same moment as a customer's own poll or the
 * sweep settling it out from under the admin.
 */
export async function adminForceRefundActivation(
  activationId: string,
  input: { reason: AdminRefundReason; note?: string },
  admin: { id: string; email: string },
): Promise<AdminRefundResult> {
  if (input.reason === "OTHER" && !input.note?.trim()) {
    return { ok: false, reason: "A note is required when the reason is \"Other\"." };
  }

  const before = await prisma.activation.findUnique({ where: { id: activationId } });
  if (!before) return { ok: false, reason: "That order no longer exists." };
  if (before.status === "RECEIVED") {
    return { ok: false, reason: "Refund unavailable because this activation already received an SMS." };
  }
  if (before.status !== "WAITING") {
    return {
      ok: false,
      reason: `Refund unavailable: this order is already ${before.status.toLowerCase()}, not pending.`,
    };
  }

  // The real, server-side verification the task requires before an admin's
  // click can move any money: ask the provider one more time, right now.
  const checked = await reconcileActivation(activationId, "ADMIN_MANUAL_CHECK");
  if (!checked) return { ok: false, reason: "That order no longer exists." };
  if (checked.status === "RECEIVED") {
    return { ok: false, reason: "Refund unavailable because this activation just received an SMS." };
  }
  if (checked.status !== "WAITING") {
    // The provider check itself already settled and refunded it (expired,
    // cancelled, or provider-refunded) — exactly the outcome a manual refund
    // would have produced, already done, automatically, a moment ago.
    return { ok: false, reason: `This order settled on its own (now ${checked.status.toLowerCase()}) and has already been refunded.` };
  }

  const now = new Date();
  const refunded = await prisma.$transaction(async (tx) => {
    const flipped = await tx.activation.updateMany({
      where: { id: activationId, status: "WAITING" },
      data: {
        status: "CANCELLED",
        refundReason: input.reason,
        refundNote: input.note?.trim() || null,
        refundedByAdminId: admin.id,
        refundedByAdminEmail: admin.email,
        refundedAt: now,
      },
    });
    if (flipped.count === 0) return null;

    const activation = await tx.activation.findUniqueOrThrow({ where: { id: activationId } });
    await creditWallet(
      activation.userId,
      activation.priceKobo,
      "REFUND",
      `Refund for ${activation.serviceName}, ${REFUND_REASON_LABEL[input.reason].toLowerCase()}`,
      activation.currency,
      activation.id,
      tx,
    );
    return activation;
  });

  if (!refunded) {
    // Lost the race: a customer poll or the sweep settled it between the
    // check above and this transaction. Not an error — the order is
    // refunded either way, just not by this click.
    return { ok: false, reason: "This order was just settled by another process; no refund was needed from here." };
  }

  await evaluateNoCodeRecovery(refunded.userId).catch((error) => {
    console.error(`[activation-lifecycle] recovery evaluation failed for ${refunded.userId}:`, error);
  });

  return { ok: true };
}
