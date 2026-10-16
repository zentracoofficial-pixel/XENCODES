"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { quotePair } from "@/lib/inventory";
import { resolveProvider, ProviderError } from "@/lib/provider";
import type { NumberProvider, PurchasedNumber } from "@/lib/provider/types";
import { autoAcceptCeilingKobo } from "@/lib/pool-ladder";
import { runPurchaseCascade } from "@/lib/purchase-cascade";
import { recordProviderAttempt, type AttemptOutcome } from "@/lib/smart-pickup";
import { providerForServer, type CustomerServer } from "@/lib/provider/customer-servers";
import { creditWallet } from "@/lib/wallet";
import { chargeOf, walletCurrencyOf } from "@/lib/wallet-currency";
import { getActiveUser } from "@/lib/session";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";
import { getDisplayContext } from "@/lib/display-preference";
import { convertMinor } from "@/lib/display-currency";
import { getDisplayRates } from "@/lib/exchange-rates";
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

/** Closed orders that ended without a code, after which Server II is
 *  suggested. */
const NO_CODE_STATUSES = new Set(["EXPIRED", "REFUNDED", "CANCELLED"]);

/** Stop starting new supplier calls after this long, so the whole purchase
 *  finishes inside a serverless request's time limit. */
const PURCHASE_TIME_BUDGET_MS = 8_000;

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
  /** Buy from this server only, by its customer-facing name ("II"). Mapped
   *  to a provider here, on the server; nothing else about the supplier is
   *  ever sent to or taken from the page. */
  server?: CustomerServer,
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
  // Read now, before the supplier is asked for a number, so nothing extra
  // happens between a number being bought and the order being recorded.
  const displayContext = await getDisplayContext().catch(() => null);

  // Step one to three: cost, rule, price. All server side, all live.
  const onlyProvider = providerForServer(server);
  if (server && !onlyProvider) return { error: "unavailable" };
  let quoted = await quotePair(serviceSlug, countrySlug, buyerCurrency, { onlyProvider });
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
  // silently, but a small rise is not worth losing the sale over either: the
  // rung they were quoted on can sell out before this lands, leaving the next
  // one up. Up to AUTO_ACCEPT_PRICE_INCREASE_PERCENT above what they were
  // shown goes through at the price of the rung they actually receive; past
  // that they see the new price and confirm. A price that dropped is fine,
  // they simply pay less.
  const agreedPriceKobo = expectedPriceKobo ?? priceKobo;
  const ceilingKobo = autoAcceptCeilingKobo(agreedPriceKobo);
  if (priceKobo > ceilingKobo) {
    return { error: "price_changed", priceKobo };
  }

  // The wallet is held in the customer's own currency. The Naira price is
  // converted once, here, at the same rates the customer's prices are shown
  // at, and that exact amount is what leaves the wallet and what a refund
  // later returns. Prices and the margin stay worked out in Naira. The
  // wallet is read after the display context, which may just have moved it
  // to the customer's chosen currency.
  const wallet = await prisma.user.findUnique({
    where: { id: user.id },
    select: { currency: true, walletBalanceKobo: true },
  });
  if (!wallet) return { error: "login_required" };
  const walletCurrency = walletCurrencyOf(wallet.currency);
  const rates = displayContext?.rates ?? (await getDisplayRates());
  const chargeFor = (naira: number) => {
    const converted = convertMinor(naira, buyerCurrency.code, walletCurrency, rates);
    // A paid number never rounds down to free in a currency with bigger units.
    return converted === null ? null : naira > 0 ? Math.max(converted, 1) : converted;
  };
  if (chargeFor(priceKobo) === null) return { error: "unpriceable" };
  // The balance in the price's currency, for choosing which supplier rungs
  // the customer can afford (the exact check is the debit below).
  const balanceInPriceCurrency =
    convertMinor(wallet.walletBalanceKobo, walletCurrency, buyerCurrency.code, rates) ?? 0;

  // Step four: can they pay. Checked before the supplier is asked for a
  // number, so a customer who cannot pay never consumes inventory. This is
  // a fast, non-atomic preliminary check against the balance read above;
  // the actual enforcement is the atomic conditional UPDATE further down.
  if (wallet.walletBalanceKobo < chargeFor(priceKobo)!) return { error: "insufficient_balance" };

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

  // Buy from the pair's price ladder, best rung first, moving down it when a
  // rung's numbers have run out (see src/lib/purchase-cascade.ts for why an
  // empty rung is not "out of stock"). Each rung is asked for by its own
  // seller id and capped at its own price, so the order records, and is
  // billed at, the rung that really served it.
  const startedAt = Date.now();
  const adapters = new Map<string, NumberProvider>([[provider, resolved.provider]]);
  const adapterFor = async (providerId: string) => {
    const known = adapters.get(providerId);
    if (known) return known;
    const next = await resolveProvider(providerId);
    if (!next.connected) throw new ProviderError("Provider not connected.", "not_configured");
    adapters.set(providerId, next.provider);
    return next.provider;
  };

  let outcome;
  try {
    outcome = await runPurchaseCascade({
      initial: quoted,
      ceilingKobo,
      balanceKobo: balanceInPriceCurrency,
      outOfTime: () => Date.now() - startedAt > PURCHASE_TIME_BUDGET_MS,
      requote: async () => {
        const fresh = await quotePair(serviceSlug, countrySlug, buyerCurrency, { onlyProvider });
        return fresh.ok ? fresh : null;
      },
      attempt: async (q, rung, rank) => {
        const attemptStartedAt = Date.now();
        const log = (outcome: AttemptOutcome, detail?: string, ref?: string) =>
          recordProviderAttempt({
            providerId: q.provider,
            serviceSlug,
            countrySlug,
            outcome,
            latencyMs: Date.now() - attemptStartedAt,
            rank,
            providerOrderRef: ref ?? null,
            detail: detail ?? null,
            userId: user.id,
          });
        try {
          const bought = await (await adapterFor(q.provider)).purchaseNumber(
            serviceSlug,
            countrySlug,
            rung.costUsdCents,
            rung.providerOfferId,
          );
          await log("ok", q.pickup ? `pickup ${q.pickup.mode}` : undefined, bought.providerOrderId);
          return bought;
        } catch (error) {
          const reason =
            error instanceof ProviderError ? error.code : error instanceof Error ? error.message : "unknown";
          const detail = error instanceof Error ? error.message : String(error);
          // Observability only (see src/lib/provider-failure-stats.ts's own
          // comment) — never consulted here or anywhere else in this flow to
          // decide what to show or sell.
          await recordPurchaseFailure(q.provider, serviceSlug, countrySlug, reason);
          if (error instanceof ProviderError && error.code === "out_of_stock") {
            await log("out_of_stock", detail);
            return null;
          }
          if (error instanceof ProviderError && (error.code === "rejected" || error.code === "not_configured")) {
            // Refused outright: nothing was bought, so the next provider may
            // be asked. This provider is not asked again for this order.
            await log("rejected", detail);
            return "skip_provider";
          }
          // Timed out or failed after the request may have been taken: it
          // might have bought a number. Never buy a second one elsewhere;
          // stop, charge nothing, and leave it for an admin to review.
          await log("ambiguous", detail);
          throw error;
        }
      },
    });
  } catch (error) {
    if (error instanceof ProviderError && error.code === "not_configured") return { error: "no_provider" };
    return { error: "provider_unavailable" };
  }

  if (!outcome.success) {
    // Sold out within what the customer agreed to pay. If dearer rungs still
    // have numbers, show the lowest of them to confirm instead of calling a
    // pair that has stock "out of stock".
    if (outcome.dearerPriceKobo !== null) return { error: "price_changed", priceKobo: outcome.dearerPriceKobo };
    return { error: "unavailable" };
  }

  const assigned: PurchasedNumber = outcome.success.assigned;
  quoted = outcome.success.quoted;
  ({ service, country, provider } = quoted);
  quote = outcome.success.quote;
  priceKobo = quote.customerPriceKobo;
  const boughtOfferId = outcome.success.providerOfferId;
  await recordPurchaseSuccess(provider, serviceSlug, countrySlug);

  const expiresAt = new Date(Date.now() + assigned.sessionSeconds * 1000);
  // What this order takes from the wallet, in the wallet's currency. Checked
  // above for the first quote; the rung actually bought has its own price.
  const chargeMinor = chargeFor(priceKobo);

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
      // Also guarded on the wallet's currency, so a balance moved to another
      // currency a moment ago is never debited in the wrong unit.
      if (chargeMinor === null) throw new Error("insufficient_balance");
      const debited = await tx.user.updateMany({
        where: { id: user.id, currency: walletCurrency, walletBalanceKobo: { gte: chargeMinor } },
        data: { walletBalanceKobo: { decrement: chargeMinor } },
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
          providerOfferId: boughtOfferId ?? null,
          currency: buyerCurrency.code,
          priceKobo,
          chargeCurrency: walletCurrency,
          chargeMinor,
          // What the customer saw is what they were charged.
          displayCurrency: walletCurrency,
          displayPriceMinor: chargeMinor,
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
          amountKobo: -chargeMinor,
          type: "PURCHASE",
          description: `${service.name} number, ${country.name}`,
          currency: walletCurrency,
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
      await adapters.get(provider)!.cancelOrder(assigned.providerOrderId);
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

  // Ask where the order really stands first: a code that has already
  // arrived is delivered, not cancelled and refunded.
  const latest = await reconcileActivation(activation.id, "CUSTOMER_POLL").catch(() => null);
  if (latest && latest.status !== "WAITING") return latest;

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
      chargeOf(activation).amountMinor,
      "REFUND",
      `Refund, cancelled ${activation.serviceName} activation`,
      chargeOf(activation).currency,
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

export interface ServerTwoOffer {
  available: boolean;
  /** The Server II price for the same service and country, in `currency`'s
   *  minor unit. */
  priceKobo?: number;
  currency?: string;
}

/** The customer's own order, if it ended without a code on another server:
 *  the one case Server II is suggested for. */
async function noCodeOrderFor(userId: string, activationId: string) {
  const activation = await prisma.activation.findFirst({
    where: { id: activationId, userId },
    select: { serviceSlug: true, countrySlug: true, provider: true, status: true, code: true },
  });
  if (!activation || activation.code || !NO_CODE_STATUSES.has(activation.status)) return null;
  if (activation.provider === providerForServer("II")) return null;
  return activation;
}

/**
 * After an order ends without a code, whether Server II can sell the same
 * service and country right now, and at what price. Only the price goes
 * back to the page.
 */
export async function getServerTwoOfferAction(activationId: string): Promise<ServerTwoOffer> {
  const user = await getActiveUser();
  if (!user || user.role === "ADMIN") return { available: false };
  const order = await noCodeOrderFor(user.id, activationId);
  if (!order) return { available: false };

  const buyerCurrency = (await getCurrencyConfig(user.currency)) ?? (await getDefaultCurrency());
  const quoted = await quotePair(order.serviceSlug, order.countrySlug, buyerCurrency, {
    onlyProvider: providerForServer("II"),
  }).catch((error) => {
    console.error(`[buy] Server II offer failed for ${order.serviceSlug}/${order.countrySlug}:`, error);
    return null;
  });
  if (!quoted?.ok) return { available: false };
  return { available: true, priceKobo: quoted.quote.customerPriceKobo, currency: buyerCurrency.code };
}

/** Buys the same service and country as an order that got no code, on
 *  Server II, at the price the customer was shown. */
export async function buyOnServerTwoAction(
  activationId: string,
  expectedPriceKobo: number,
  idempotencyKey: string,
): Promise<PurchaseResult> {
  const user = await getActiveUser();
  if (!user) return { error: "login_required" };
  const order = await noCodeOrderFor(user.id, activationId);
  if (!order) return { error: "unavailable" };
  return purchaseNumberAction(order.serviceSlug, order.countrySlug, expectedPriceKobo, idempotencyKey, "II");
}
