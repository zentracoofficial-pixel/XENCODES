"use server";

import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { quotePair } from "@/lib/inventory";
import { resolveProvider, ProviderError } from "@/lib/provider";
import { creditWallet } from "@/lib/wallet";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";
import { countRecentSuccessfulPurchases, getUnverifiedDailyPurchaseLimit } from "@/lib/verification";
import { recordPurchaseFailure, recordPurchaseSuccess } from "@/lib/provider-failure-stats";
import { notifyNumberPurchaseSale } from "@/lib/sales-notification";

/**
 * Buying a number, and waiting for its code.
 *
 * The order of operations here is the business rule, not a style choice.
 * Before a number is ever reserved Xencodes establishes, on the server:
 * what the supplier charges, which pricing rule applies, what the customer
 * pays, and that the customer can pay it. An order that cannot answer all
 * four is refused rather than placed, because an order with an unknown
 * cost has an unknown margin, and that is a liability rather than a sale.
 *
 * The price charged is never taken from the page the customer was looking
 * at and never from a cache.
 */

export type PurchaseError =
  | "login_required"
  | "admin_account"
  | "no_provider"
  | "unavailable"
  | "unpriceable"
  | "insufficient_balance"
  | "provider_unavailable"
  | "price_changed"
  | "unverified_limit_reached"
  | "unknown";

export interface PurchaseResult {
  error?: PurchaseError;
  activationId?: string;
  /** Set with "price_changed" so the UI can show the new figure. */
  priceKobo?: number;
}

export async function purchaseNumberAction(
  serviceSlug: string,
  countrySlug: string,
  expectedPriceKobo?: number,
  /**
   * A client-generated key, stable across retries of the same buy-panel
   * selection (see buy-panel.tsx). Guards against a duplicate form
   * submission, a retried network request, or a double-click that gets past
   * the button's own disabled-while-pending state creating two separate
   * orders (and charging the wallet twice) for what the customer experienced
   * as one purchase. Optional and purely additive: omitting it only means
   * this one extra safety net is skipped, never that the purchase is
   * refused.
   */
  idempotencyKey?: string,
): Promise<PurchaseResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "login_required" };

  // Checked before anything else, including the live quote: if this exact
  // attempt already produced an order, hand back that same order rather
  // than pricing and potentially buying a second number.
  if (idempotencyKey) {
    const already = await prisma.activation.findUnique({
      where: { idempotencyKey },
      select: { id: true, userId: true },
    });
    if (already && already.userId === session.user.id) {
      return { activationId: already.id };
    }
  }

  // Which account can pay, and in which currency, is established before any
  // supplier lookup: everything downstream (the quote, the charge, the
  // stored order) is priced in this account's own currency, never assumed
  // to be Naira. Checked here too, rather than only later: a session issued
  // before a suspension or deletion stays valid until it expires on its own
  // (JWT strategy), so this is what actually stops it from spending money
  // in the meantime. The proxy already keeps admins out of the buy flow;
  // this is the authoritative check, in case someone calls this action
  // directly.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "unknown" };
  if (user.deletedAt || user.status !== "ACTIVE") return { error: "unknown" };
  if (user.role === "ADMIN") return { error: "admin_account" };

  const buyerCurrency = (await getCurrencyConfig(user.currency)) ?? (await getDefaultCurrency());

  // Step one to three: cost, rule, price. All server side, all live.
  const quoted = await quotePair(serviceSlug, countrySlug, buyerCurrency);
  if (!quoted.ok) {
    if (quoted.reason === "no_provider") return { error: "no_provider" };
    if (quoted.reason === "provider_error") return { error: "provider_unavailable" };
    if (quoted.reason === "unpriceable") return { error: "unpriceable" };
    return { error: "unavailable" };
  }

  const { quote, service, country, provider } = quoted;
  const priceKobo = quote.customerPriceKobo;

  // The rule this whole path exists to protect. quotePrice() already
  // clamps to cost, so this only fires if that ever regresses, and it
  // refuses the sale rather than completing one that loses money.
  if (priceKobo < quote.providerCostKobo) {
    console.error(
      `[buy] refusing negative margin order: ${serviceSlug}/${countrySlug} ` +
        `price ${priceKobo} below cost ${quote.providerCostKobo}`,
    );
    return { error: "unpriceable" };
  }

  // Charging more than the customer agreed to is not something to do
  // silently. A price that dropped is fine, they simply pay less.
  if (expectedPriceKobo !== undefined && priceKobo > expectedPriceKobo) {
    return { error: "price_changed", priceKobo };
  }

  // Step four: can they pay. Checked before the supplier is asked for a
  // number, so a customer who cannot pay never consumes inventory. This is
  // a fast, non-atomic preliminary check against the balance read above;
  // the actual enforcement is the atomic conditional UPDATE further down.
  if (user.walletBalanceKobo < priceKobo) return { error: "insufficient_balance" };

  // Same fast, non-atomic shape as the balance check just above: a rough
  // preliminary check so an account that is obviously already at its limit
  // never reaches the supplier at all. Skipped entirely once verified — see
  // getUnverifiedDailyPurchaseLimit() and countRecentSuccessfulPurchases() in
  // src/lib/verification.ts, the one place this "10" and "24 hours" live.
  // The real enforcement is the atomic re-check inside the transaction
  // below, which a fast check like this cannot make race-safe on its own.
  if (!user.emailVerified) {
    const recentPurchases = await countRecentSuccessfulPurchases(user.id);
    if (recentPurchases >= getUnverifiedDailyPurchaseLimit()) {
      return { error: "unverified_limit_reached" };
    }
  }

  // The exact provider quotePair() just picked this pair's winning price
  // from, re-resolved fresh rather than trusting getNumberProvider(): with
  // more than one provider enabled, "the" provider is not a stable idea,
  // and a purchase must go to the same one the customer's price came from.
  const resolved = await resolveProvider(provider);
  if (!resolved.connected) return { error: "no_provider" };

  let assigned;
  try {
    // The provider-side safety rail: an adapter that can enforce a price
    // ceiling refuses the purchase itself if the live cost has risen past
    // what was just quoted, rather than this silently paying more.
    assigned = await resolved.provider.purchaseNumber(
      serviceSlug,
      countrySlug,
      quote.providerCostKobo,
    );
  } catch (error) {
    const reason =
      error instanceof ProviderError ? error.code : error instanceof Error ? error.message : "unknown";
    // Observability only (see src/lib/provider-failure-stats.ts's own
    // comment) — never consulted here or anywhere else in this flow to
    // decide what to show or sell.
    await recordPurchaseFailure(provider, serviceSlug, countrySlug, reason);
    if (error instanceof ProviderError && error.code === "out_of_stock") {
      return { error: "unavailable" };
    }
    return { error: "provider_unavailable" };
  }
  await recordPurchaseSuccess(provider, serviceSlug, countrySlug);

  const expiresAt = new Date(Date.now() + assigned.sessionSeconds * 1000);

  try {
    const activation = await prisma.$transaction(async (tx) => {
      // The real enforcement of the unverified purchase limit. The fast
      // check above is only a courtesy that skips a supplier call for the
      // common case; it is not race-safe on its own, since two concurrent
      // requests for the same user could both read a count under the limit
      // before either commits. pg_advisory_xact_lock serializes concurrent
      // purchases for this exact user (hashtext turns the id into the
      // lock's bigint key) so the second one always recounts against the
      // first one's already-committed activation, the same way the balance
      // UPDATE below closes the equivalent race for wallet debits. The lock
      // is released automatically when this transaction ends, however it
      // ends.
      if (!user.emailVerified) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        const recentPurchases = await countRecentSuccessfulPurchases(user.id, tx);
        if (recentPurchases >= getUnverifiedDailyPurchaseLimit()) {
          throw new Error("unverified_limit_reached");
        }
      }

      // A single conditional UPDATE, not a read then a separate write: two
      // concurrent purchases (a double-click, two open tabs, a retried
      // request) can both read the same pre-decrement balance under
      // Postgres's default READ COMMITTED isolation before either commits,
      // so a plain "read balance, then decrement" here would let both
      // pass and both debit, even inside a transaction. Putting the
      // balance check in the UPDATE's own WHERE clause makes the check and
      // the debit one atomic statement: only the request that finds the
      // row still affordable at the moment it actually runs can succeed,
      // and Postgres serializes concurrent UPDATEs to the same row so the
      // second one re-evaluates against the first one's already-applied
      // result rather than a stale read.
      const debited = await tx.user.updateMany({
        where: { id: user.id, walletBalanceKobo: { gte: priceKobo } },
        data: { walletBalanceKobo: { decrement: priceKobo } },
      });
      if (debited.count === 0) {
        throw new Error("insufficient_balance");
      }

      // Steps five to seven: the order, priced by the backend, carrying
      // the economics that were true when it was placed.
      const created = await tx.activation.create({
        data: {
          userId: user.id,
          serviceSlug: service.slug,
          serviceName: service.name,
          countrySlug: country.slug,
          countryName: country.name,
          phoneNumber: assigned.phoneNumber,
          provider,
          providerOrderId: assigned.providerOrderId,
          providerServiceId: quoted.providerServiceId ?? null,
          providerCountryId: quoted.providerCountryId ?? null,
          currency: buyerCurrency.code,
          priceKobo,
          providerCostKobo: quote.providerCostKobo,
          grossProfitKobo: quote.grossProfitKobo,
          targetMarginPercent: quote.targetMarginPercent,
          pricingRule: quote.rule,
          expiresAt,
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      // Created after the order so the ledger row can name it, which is
      // what lets the admin see an order and the money that moved with it
      // side by side.
      await tx.walletTransaction.create({
        data: {
          userId: user.id,
          amountKobo: -priceKobo,
          type: "PURCHASE",
          description: `${service.name} number, ${country.name}`,
          currency: buyerCurrency.code,
          activationId: created.id,
        },
      });

      return created;
    });

    // Only reached once per genuinely new Activation: the two paths that
    // hand back an *existing* order instead (the idempotencyKey lookup at
    // the top of this function, and the P2002 race handled below) both
    // return before this point, so a retried request or a double-click
    // never reaches this a second time for the same purchase.
    await notifyNumberPurchaseSale(activation.id).catch((error) => {
      console.error(`[buy] sales notification failed for activation ${activation.id}:`, error);
    });

    return { activationId: activation.id };
  } catch (error) {
    // A genuinely concurrent duplicate of this exact attempt (same
    // idempotencyKey) lost the race to create its Activation row — the
    // other request's order already exists and already has the customer's
    // money attached to it correctly, so this is not a failure to report,
    // it is the same purchase finishing from a second angle. Hand back that
    // order rather than cancelling the number a concurrent request is
    // about to show the customer.
    if (
      idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await prisma.activation.findUnique({ where: { idempotencyKey } });
      if (winner && winner.userId === session.user.id) {
        return { activationId: winner.id };
      }
    }

    // The number was already reserved, so hand it back rather than leaving
    // it held for a purchase that did not complete.
    try {
      await resolved.provider.cancelOrder(assigned.providerOrderId);
    } catch {
      // Nothing more we can do here; the hold lapses on the supplier side.
    }

    if (error instanceof Error && error.message === "insufficient_balance") {
      return { error: "insufficient_balance" };
    }
    if (error instanceof Error && error.message === "unverified_limit_reached") {
      return { error: "unverified_limit_reached" };
    }
    return { error: "unknown" };
  }
}

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

function toState(activation: ActivationRow): ActivationState {
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

/**
 * Polled by the activation view. Asks the supplier whether the code has
 * landed, and settles the order when it has, or when time runs out.
 *
 * Scoped to the signed-in customer's own orders by the query itself, so
 * one customer cannot poll another's activation by guessing an id.
 */
export async function getActivationStateAction(
  activationId: string,
): Promise<ActivationState | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const activation = await prisma.activation.findFirst({
    where: { id: activationId, userId: session.user.id },
  });
  if (!activation) return null;
  if (activation.status !== "WAITING") return toState(activation);

  const now = new Date();
  // Polls the exact provider that fulfilled this order, not whichever
  // provider currently resolves first: a different activation bought
  // through a different enabled provider must be checked against that one.
  const resolved = await resolveProvider(activation.provider);

  let sms;
  if (resolved.connected && activation.providerOrderId) {
    try {
      sms = await resolved.provider.getOrderStatus(activation.providerOrderId);
    } catch {
      // A supplier hiccup should not settle the order. Keep waiting and let
      // the next poll try again.
      return toState(activation);
    }
  } else {
    // No supplier to ask. The session still expires on schedule below, so
    // an order left behind by a disconnected supplier is refunded rather
    // than left waiting forever.
    sms = { state: "waiting" } as const;
  }

  if (sms.state === "received") {
    const received = await prisma.activation.update({
      where: { id: activation.id },
      data: { status: "RECEIVED", code: sms.code, receivedAt: now },
    });
    return toState(received);
  }

  // Three different ways an order ends without a code, recorded as three
  // different things. The customer is refunded in full either way, but the
  // history should say what actually happened rather than calling every
  // one of them a timeout.
  const settled =
    sms.state === "refunded"
      ? { status: "REFUNDED" as const, why: "the provider refunded it" }
      : sms.state === "cancelled"
        ? { status: "CANCELLED" as const, why: "it was cancelled" }
        : sms.state === "expired" || now >= activation.expiresAt
          ? { status: "EXPIRED" as const, why: "no code arrived in time" }
          : null;

  if (settled) {
    const userId = session.user.id;
    const closed = await prisma.$transaction(async (tx) => {
      // Atomic: only the caller that actually flips this activation out of
      // WAITING gets to credit its refund. Without this guard, two
      // concurrent settlements for the same activation (this poll firing
      // twice, or racing a manual cancel) could each read "still WAITING"
      // before either commits and each credit the wallet, minting money
      // out of a single order with no cap on how many times.
      const flipped = await tx.activation.updateMany({
        where: { id: activation.id, status: "WAITING" },
        data: { status: settled.status },
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

    // A concurrent call already settled it: return its real current state
    // rather than crediting anything a second time.
    return toState(closed ?? (await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } })));
  }

  return toState(activation);
}

export async function cancelActivationAction(
  activationId: string,
): Promise<ActivationState | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const activation = await prisma.activation.findFirst({
    where: { id: activationId, userId: session.user.id },
  });
  if (!activation || activation.status !== "WAITING") return null;

  if (activation.providerOrderId) {
    try {
      const resolved = await resolveProvider(activation.provider);
      if (resolved.connected) {
        await resolved.provider.cancelOrder(activation.providerOrderId);
      }
    } catch {
      // Release failed on the supplier side. The hold lapses on its own,
      // and the customer should still get their money back.
    }
  }

  const userId = session.user.id;
  const cancelled = await prisma.$transaction(async (tx) => {
    // Same atomic guard as the settlement path above: only the request
    // that actually moves this activation out of WAITING credits the
    // refund, so a cancel racing a poll (or two cancel requests for the
    // same activation) cannot both pass a stale read and both credit.
    const flipped = await tx.activation.updateMany({
      where: { id: activation.id, status: "WAITING" },
      data: { status: "CANCELLED" },
    });
    if (flipped.count === 0) return null;

    await creditWallet(
      userId,
      activation.priceKobo,
      "REFUND",
      `Refund, cancelled ${activation.serviceName} activation`,
      activation.currency,
      activation.id,
      tx,
    );

    return tx.activation.findUniqueOrThrow({ where: { id: activation.id } });
  });

  if (!cancelled) return null;
  return toState(cancelled);
}
