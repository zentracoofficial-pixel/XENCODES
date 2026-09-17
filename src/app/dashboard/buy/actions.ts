"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { quotePair } from "@/lib/inventory";
import { getNumberProvider, ProviderError } from "@/lib/provider";
import { creditWallet } from "@/lib/wallet";

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
): Promise<PurchaseResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "login_required" };

  // Step one to three: cost, rule, price. All server side, all live.
  const quoted = await quotePair(serviceSlug, countrySlug);
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
  // number, so a customer who cannot pay never consumes inventory.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "unknown" };
  // The proxy already keeps admins out of the buy flow; this is the
  // authoritative check, in case someone calls this action directly.
  if (user.role === "ADMIN") return { error: "admin_account" };
  if (user.walletBalanceKobo < priceKobo) return { error: "insufficient_balance" };

  const resolved = await getNumberProvider();
  if (!resolved.connected) return { error: "no_provider" };

  let assigned;
  try {
    assigned = await resolved.provider.purchaseNumber(serviceSlug, countrySlug);
  } catch (error) {
    if (error instanceof ProviderError && error.code === "out_of_stock") {
      return { error: "unavailable" };
    }
    return { error: "provider_unavailable" };
  }

  const expiresAt = new Date(Date.now() + assigned.sessionSeconds * 1000);

  try {
    const activation = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction so two purchases at once cannot both
      // pass the balance check above.
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (current.walletBalanceKobo < priceKobo) {
        throw new Error("insufficient_balance");
      }

      await tx.user.update({
        where: { id: current.id },
        data: { walletBalanceKobo: { decrement: priceKobo } },
      });

      // Steps five to seven: the order, priced by the backend, carrying
      // the economics that were true when it was placed.
      const created = await tx.activation.create({
        data: {
          userId: current.id,
          serviceSlug: service.slug,
          serviceName: service.name,
          countrySlug: country.slug,
          countryName: country.name,
          phoneNumber: assigned.phoneNumber,
          provider,
          providerOrderId: assigned.providerOrderId,
          priceKobo,
          providerCostKobo: quote.providerCostKobo,
          grossProfitKobo: quote.grossProfitKobo,
          targetMarginPercent: quote.targetMarginPercent,
          pricingRule: quote.rule,
          expiresAt,
        },
      });

      // Created after the order so the ledger row can name it, which is
      // what lets the admin see an order and the money that moved with it
      // side by side.
      await tx.walletTransaction.create({
        data: {
          userId: current.id,
          amountKobo: -priceKobo,
          type: "PURCHASE",
          description: `${service.name} number, ${country.name}`,
          activationId: created.id,
        },
      });

      return created;
    });

    return { activationId: activation.id };
  } catch (error) {
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
  status: "WAITING" | "RECEIVED" | "EXPIRED" | "CANCELLED" | "REFUNDED";
  code: string | null;
  expiresAt: string;
}

interface ActivationRow {
  id: string;
  serviceSlug: string;
  serviceName: string;
  countryName: string;
  phoneNumber: string;
  priceKobo: number;
  status: string;
  code: string | null;
  expiresAt: Date;
}

function toState(activation: ActivationRow): ActivationState {
  return {
    id: activation.id,
    serviceSlug: activation.serviceSlug,
    serviceName: activation.serviceName,
    countryName: activation.countryName,
    phoneNumber: activation.phoneNumber,
    priceKobo: activation.priceKobo,
    status: activation.status as ActivationState["status"],
    code: activation.code,
    expiresAt: activation.expiresAt.toISOString(),
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
  const resolved = await getNumberProvider();

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
    const closed = await prisma.activation.update({
      where: { id: activation.id },
      data: { status: settled.status },
    });
    await creditWallet(
      session.user.id,
      activation.priceKobo,
      "REFUND",
      `Refund for ${activation.serviceName}, ${settled.why}`,
      activation.id,
    );
    return toState(closed);
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
      const resolved = await getNumberProvider();
      if (resolved.connected) {
        await resolved.provider.cancelOrder(activation.providerOrderId);
      }
    } catch {
      // Release failed on the supplier side. The hold lapses on its own,
      // and the customer should still get their money back.
    }
  }

  const cancelled = await prisma.activation.update({
    where: { id: activation.id },
    data: { status: "CANCELLED" },
  });

  await creditWallet(
    session.user.id,
    activation.priceKobo,
    "REFUND",
    `Refund, cancelled ${activation.serviceName} activation`,
    activation.id,
  );

  return toState(cancelled);
}
