"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCatalog, revalidateCatalog } from "@/lib/catalog";
import { getLiveQuote, getServiceMeta } from "@/lib/inventory";
import { getProvider, ProviderError } from "@/lib/provider";
import { creditWallet } from "@/lib/wallet";

export type PurchaseError =
  | "login_required"
  | "admin_account"
  | "unavailable"
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

/**
 * Buys one number.
 *
 * The price charged here is never taken from the page the customer was
 * looking at, and never from a cache. It is re-derived from a provider
 * cost fetched in this request, moments before the number is reserved,
 * because a cached price that has since gone up is exactly how a sale
 * ends up below what the provider bills. `expectedPriceKobo` is what the
 * customer was shown: if the live price has risen past it, the purchase
 * stops and the customer is asked to confirm the new figure rather than
 * being quietly charged more than they agreed to.
 */
export async function purchaseNumberAction(
  serviceSlug: string,
  countrySlug: string,
  expectedPriceKobo?: number,
): Promise<PurchaseResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "login_required" };

  const [meta, quoted] = await Promise.all([
    getServiceMeta(serviceSlug),
    getLiveQuote(serviceSlug, countrySlug),
  ]);

  if (!meta) return { error: "unavailable" };
  if (!quoted.ok) {
    if (quoted.reason === "provider_error") return { error: "provider_unavailable" };
    // The provider says this pair cannot be sold, which is fresher than
    // anything the catalog cache knows. Drop the cache so it stops being
    // offered instead of waiting for the refresh window to turn over.
    revalidateCatalog();
    return { error: "unavailable" };
  }

  const { quote } = quoted;
  const priceKobo = quote.customerPriceKobo;

  // The rule this whole path exists to protect. quotePrice() already
  // clamps to cost, so this only fires if that ever regresses, and it
  // refuses the sale rather than completing one that loses money.
  if (priceKobo < quote.providerCostKobo) {
    console.error(
      `[buy] refusing negative margin order: ${serviceSlug}/${countrySlug} ` +
        `price ${priceKobo} below cost ${quote.providerCostKobo}`,
    );
    return { error: "unavailable" };
  }

  // Charging more than the customer agreed to is not something to do
  // silently. A price that dropped is fine, they simply pay less.
  if (expectedPriceKobo !== undefined && priceKobo > expectedPriceKobo) {
    return { error: "price_changed", priceKobo };
  }

  const country = (await getProvider().then((p) => p.listCountries())).find(
    (row) => row.slug === countrySlug,
  );
  if (!country) return { error: "unavailable" };

  // Check funds before asking the provider for a number, so a customer who
  // cannot pay never consumes inventory.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "unknown" };
  // The proxy already keeps admins out of /buy; this is the authoritative
  // check, in case that ever changes or someone calls this action directly.
  if (user.role === "ADMIN") return { error: "admin_account" };
  if (user.walletBalanceKobo < priceKobo) return { error: "insufficient_balance" };

  let assigned;
  try {
    const provider = await getProvider();
    assigned = await provider.requestNumber(serviceSlug, countrySlug);
  } catch (error) {
    if (error instanceof ProviderError && error.code === "out_of_stock") {
      // The provider just told us this pair is gone, which is fresher than
      // anything the price cache knows. Drop the cached catalog now so the
      // country stops being offered on the next load, instead of staying
      // listed as in stock until the refresh window happens to turn over.
      revalidateCatalog();
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

      await tx.walletTransaction.create({
        data: {
          userId: current.id,
          amountKobo: -priceKobo,
          type: "PURCHASE",
          description: `${meta.name} number, ${country.name}`,
        },
      });

      return tx.activation.create({
        data: {
          userId: current.id,
          serviceSlug: meta.slug,
          serviceName: meta.name,
          countrySlug: country.slug,
          countryName: country.name,
          phoneNumber: assigned.phoneNumber,
          externalId: assigned.externalId,
          priceKobo,
          // Captured from the quote this purchase was validated against, so
          // the order's real margin stays answerable later even after the
          // provider's price has moved on.
          providerCostKobo: quote.providerCostKobo,
          markupKobo: quote.markupKobo,
          expiresAt,
        },
      });
    });

    return { activationId: activation.id };
  } catch (error) {
    // The number was already reserved, so hand it back rather than leaving it
    // held for a purchase that did not complete.
    try {
      const provider = await getProvider();
      await provider.cancelNumber(assigned.externalId);
    } catch {
      // Nothing more we can do here; the hold lapses on the provider side.
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
  flag: string;
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
  countrySlug: string;
  countryName: string;
  phoneNumber: string;
  priceKobo: number;
  status: string;
  code: string | null;
  expiresAt: Date;
}

async function toState(activation: ActivationRow): Promise<ActivationState> {
  return {
    id: activation.id,
    serviceSlug: activation.serviceSlug,
    serviceName: activation.serviceName,
    countryName: activation.countryName,
    flag: await flagFor(activation.countrySlug),
    phoneNumber: activation.phoneNumber,
    priceKobo: activation.priceKobo,
    status: activation.status as ActivationState["status"],
    code: activation.code,
    expiresAt: activation.expiresAt.toISOString(),
  };
}

async function flagFor(countrySlug: string) {
  // Read through the already-cached catalog rather than instantiating the
  // provider and re-fetching every country: this runs on every activation
  // poll (every few seconds while a customer waits for a code), so hitting
  // a live provider directly here would mean real outbound requests on a
  // tight loop instead of one cached lookup.
  const { countries } = await getCatalog();
  return countries.find((c) => c.slug === countrySlug)?.flag ?? "";
}

/**
 * Polled by the activation view. Asks the provider whether the code has
 * landed, and settles the activation when it has, or when time runs out.
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
  const provider = await getProvider();

  let sms;
  try {
    sms = activation.externalId
      ? await provider.checkSms(activation.externalId)
      : ({ state: "waiting" } as const);
  } catch {
    // A provider hiccup should not settle the activation. Keep waiting and
    // let the next poll try again.
    return toState(activation);
  }

  if (sms.state === "received") {
    const received = await prisma.activation.update({
      where: { id: activation.id },
      data: { status: "RECEIVED", code: sms.code, receivedAt: now },
    });
    return toState(received);
  }

  // Three different ways an activation ends without a code, recorded as
  // three different things. The customer is refunded in full either way,
  // but the order history should say what actually happened rather than
  // calling every one of them a timeout.
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

  if (activation.externalId) {
    try {
      const provider = await getProvider();
      await provider.cancelNumber(activation.externalId);
    } catch {
      // Release failed on the provider side. The hold lapses on its own, and
      // the customer should still get their money back.
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
  );

  return toState(cancelled);
}
