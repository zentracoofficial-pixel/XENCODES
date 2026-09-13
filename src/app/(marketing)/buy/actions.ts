"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCatalog, getOfferForBuy, revalidateCatalog } from "@/lib/catalog";
import { getProvider, ProviderError } from "@/lib/provider";
import { creditWallet } from "@/lib/wallet";
import { nairaToKobo } from "@/lib/currency";

export type PurchaseError =
  | "login_required"
  | "admin_account"
  | "unavailable"
  | "insufficient_balance"
  | "provider_unavailable"
  | "unknown";

export interface PurchaseResult {
  error?: PurchaseError;
  activationId?: string;
}

export async function purchaseNumberAction(
  serviceSlug: string,
  countrySlug: string,
): Promise<PurchaseResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "login_required" };

  // Read through the resolved catalog so the customer is charged the
  // admin-set price and a disabled item cannot be bought via a stale link.
  // getOfferForBuy() also covers a service outside the eagerly priced set,
  // pricing it live on demand rather than only recognising what getCatalog()
  // already precomputed. The cost price behind this is refreshed every 45
  // minutes (see PROVIDER_CACHE_SECONDS in smspool.ts), not re-verified per
  // purchase: the admin markup exists to absorb ordinary cost drift between
  // refreshes, so a purchase always charges the same price the customer was
  // just shown.
  const match = await getOfferForBuy(serviceSlug, countrySlug);
  if (!match) return { error: "unavailable" };

  const { service, offer } = match;
  const priceKobo = nairaToKobo(offer.priceNaira);

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
          description: `${service.name} number, ${offer.countryName}`,
        },
      });

      return tx.activation.create({
        data: {
          userId: current.id,
          serviceSlug: service.slug,
          serviceName: service.name,
          countrySlug: offer.countrySlug,
          countryName: offer.countryName,
          phoneNumber: assigned.phoneNumber,
          externalId: assigned.externalId,
          priceKobo,
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
  status: "WAITING" | "RECEIVED" | "EXPIRED" | "CANCELLED";
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

  if (sms.state === "expired" || now >= activation.expiresAt) {
    const expired = await prisma.activation.update({
      where: { id: activation.id },
      data: { status: "EXPIRED" },
    });
    await creditWallet(
      session.user.id,
      activation.priceKobo,
      "REFUND",
      `Refund, no code received for ${activation.serviceName}`,
    );
    return toState(expired);
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
