"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { quotePair } from "@/lib/inventory";
import { resolveProvider, ProviderError } from "@/lib/provider";
import { creditWallet } from "@/lib/wallet";
import { getActiveUser } from "@/lib/session";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";
import { countRecentSuccessfulPurchases, getUnverifiedDailyPurchaseLimit } from "@/lib/verification";
import { recordPurchaseFailure, recordPurchaseSuccess } from "@/lib/provider-failure-stats";
import { evaluateNoCodeRecovery } from "@/lib/recovery";
import {
  reconcileActivation,
  toActivationState,
  type ActivationState,
} from "@/lib/activation-lifecycle";

export type { ActivationState } from "@/lib/activation-lifecycle";

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
  // getActiveUser(), not a bare session check: this is a server action,
  // invoked directly from the buy panel's client component rather than
  // through a page navigation, so the dashboard layout's requireActiveUser()
  // gate never runs in front of it. getActiveUser() re-reads the account
  // fresh (deletedAt, status) and compares the token's stamped
  // sessionVersion against the current column (see its own comment in
  // src/lib/session.ts), which is what actually stops a suspended/deleted
  // account, or a session already revoked by a password change or "log out
  // everywhere", from still being able to spend real money through this
  // exact entry point. The proxy only ever keeps admins out of the page;
  // this is the authoritative check for the action itself.
  const user = await getActiveUser();
  if (!user) return { error: "login_required" };
  if (user.role === "ADMIN") return { error: "admin_account" };

  // Checked before anything else, including the live quote: if this exact
  // attempt already produced an order, hand back that same order rather
  // than pricing and potentially buying a second number.
  if (idempotencyKey) {
    const already = await prisma.activation.findUnique({
      where: { idempotencyKey },
      select: { id: true, userId: true },
    });
    if (already && already.userId === user.id) {
      return { activationId: already.id };
    }
  }

  const buyerCurrency = (await getCurrencyConfig(user.currency)) ?? (await getDefaultCurrency());

  // Step one to three: cost, rule, price. All server side, all live.
  let quoted = await quotePair(serviceSlug, countrySlug, buyerCurrency);
  if (!quoted.ok) {
    if (quoted.reason === "no_provider") return { error: "no_provider" };
    if (quoted.reason === "provider_error") return { error: "provider_unavailable" };
    if (quoted.reason === "unpriceable") return { error: "unpriceable" };
    return { error: "unavailable" };
  }

  let { quote, service, country, provider } = quoted;
  let priceKobo = quote.customerPriceKobo;

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
  let resolved = await resolveProvider(provider);
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
      quoted.providerOfferId,
    );
  } catch (error) {
    const reason =
      error instanceof ProviderError ? error.code : error instanceof Error ? error.message : "unknown";
    // Observability only (see src/lib/provider-failure-stats.ts's own
    // comment) — never consulted here or anywhere else in this flow to
    // decide what to show or sell.
    await recordPurchaseFailure(provider, serviceSlug, countrySlug, reason);
    if (!(error instanceof ProviderError) || error.code !== "out_of_stock") {
      return { error: "provider_unavailable" };
    }

    // "Out of stock" from the provider a moment after quotePair() itself
    // confirmed stock is not necessarily true anymore: this whole flow's
    // inventory is shared with every other buyer on the supplier's own
    // platform, and the cheapest numbers can be bought out from under this
    // exact request in the gap between the quote and the purchase call —
    // same root cause as the targeted-pool fallback in the provider adapter
    // itself, just one level up. Re-quoting fresh, once, tells a real
    // sellout apart from a pair that is still buyable at a price this
    // request's own ceiling no longer matches, rather than reporting the
    // pair out of stock when it may not be.
    const recheck = await quotePair(serviceSlug, countrySlug, buyerCurrency);
    if (!recheck.ok) return { error: "unavailable" };

    if (recheck.quote.customerPriceKobo !== priceKobo) {
      // The live price moved. Never silently charge more than what the
      // customer agreed to: surface this exactly like any other mid-flow
      // price change (see the expectedPriceKobo check above) so they see
      // the new figure and confirm again, win or lose.
      return { error: "price_changed", priceKobo: recheck.quote.customerPriceKobo };
    }

    // Nothing the customer agreed to has changed — same price, same pair —
    // so this is a one-time, invisible retry against the fresh quote
    // rather than a dead end over a transient stock race. Every local
    // binding downstream is refreshed from the recheck so the order
    // actually recorded matches whichever provider/pool really fulfilled
    // it, not the one originally targeted.
    quoted = recheck;
    ({ quote, service, country, provider } = quoted);
    priceKobo = quote.customerPriceKobo;
    resolved = await resolveProvider(provider);
    if (!resolved.connected) return { error: "no_provider" };

    try {
      assigned = await resolved.provider.purchaseNumber(
        serviceSlug,
        countrySlug,
        quote.providerCostKobo,
        quoted.providerOfferId,
      );
    } catch (retryError) {
      const retryReason =
        retryError instanceof ProviderError
          ? retryError.code
          : retryError instanceof Error
            ? retryError.message
            : "unknown";
      await recordPurchaseFailure(provider, serviceSlug, countrySlug, retryReason);
      return { error: "unavailable" };
    }
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
          providerOfferId: quoted.providerOfferId ?? null,
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

    // No sales notification here: a purchase reserving a number and
    // debiting the wallet is not yet a completed sale, and the admin alert
    // must not fire before the customer has actually received their code.
    // See getActivationStateAction() below, which sends it once the order
    // actually settles into RECEIVED.

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
      if (winner && winner.userId === user.id) {
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

/**
 * Polled by the activation view. Asks the supplier whether the code has
 * landed, and settles the order when it has, or when time runs out.
 *
 * Scoped to the signed-in customer's own orders by the query itself, so one
 * customer cannot poll another's activation by guessing an id. The actual
 * settlement (asking the provider, finalizing on RECEIVED, refunding on a
 * no-code terminal state) lives in reconcileActivation() — see
 * src/lib/activation-lifecycle.ts — the same function an admin's passive
 * view, an admin's manual refund check, and the daily sweep all call, so a
 * customer's own poll is never a different code path than any of those.
 */
export async function getActivationStateAction(
  activationId: string,
): Promise<ActivationState | null> {
  // getActiveUser(), not a bare session check — see purchaseNumberAction()'s
  // own comment above: this is a server action invoked directly from the
  // activation view, not through a page load, so a suspended/deleted/revoked
  // session must be re-checked here rather than assumed caught upstream.
  const user = await getActiveUser();
  if (!user) return null;

  const owned = await prisma.activation.findFirst({
    where: { id: activationId, userId: user.id },
    select: { id: true },
  });
  if (!owned) return null;

  return reconcileActivation(activationId, "CUSTOMER_POLL");
}

export async function cancelActivationAction(
  activationId: string,
): Promise<ActivationState | null> {
  // See getActivationStateAction()'s own comment: this credits a refund to
  // the wallet, so it must never run for a suspended/deleted/revoked
  // session just because its JWT has not yet expired.
  const user = await getActiveUser();
  if (!user) return null;

  const activation = await prisma.activation.findFirst({
    where: { id: activationId, userId: user.id },
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

  const userId = user.id;
  const now = new Date();
  const cancelled = await prisma.$transaction(async (tx) => {
    // Same atomic guard as reconcileActivation()'s own settlement: only the
    // request that actually moves this activation out of WAITING credits the
    // refund, so a cancel racing a poll (or two cancel requests for the same
    // activation) cannot both pass a stale read and both credit.
    const flipped = await tx.activation.updateMany({
      where: { id: activation.id, status: "WAITING" },
      data: {
        status: "CANCELLED",
        refundReason: "CANCELLED_BY_CUSTOMER",
        refundedAt: now,
      },
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

  await evaluateNoCodeRecovery(userId).catch((error) => {
    console.error(`[buy] recovery evaluation failed for user ${userId}:`, error);
  });

  return toActivationState(cancelled);
}
