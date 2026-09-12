"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getServiceBySlug } from "@/data/services";
import { getCountryBySlug } from "@/data/countries";
import { assignNumber, generateVerificationCode } from "@/lib/provider";
import { creditWallet } from "@/lib/wallet";
import { nairaToKobo } from "@/lib/currency";

export interface PurchaseResult {
  error?: "login_required" | "unavailable" | "insufficient_balance" | "unknown";
  activationId?: string;
}

export async function purchaseNumberAction(
  serviceSlug: string,
  countrySlug: string,
): Promise<PurchaseResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "login_required" };
  }

  const service = getServiceBySlug(serviceSlug);
  const country = getCountryBySlug(countrySlug);
  const availability = service?.availability.find((a) => a.countrySlug === countrySlug);

  if (!service || !country || !availability || availability.status === "unavailable") {
    return { error: "unavailable" };
  }

  const priceKobo = nairaToKobo(availability.priceNaira);
  const assigned = assignNumber(country.dialCode);
  const now = new Date();

  try {
    const activation = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: session.user.id } });
      if (user.walletBalanceKobo < priceKobo) {
        throw new Error("insufficient_balance");
      }

      await tx.user.update({
        where: { id: user.id },
        data: { walletBalanceKobo: { decrement: priceKobo } },
      });

      await tx.walletTransaction.create({
        data: {
          userId: user.id,
          amountKobo: -priceKobo,
          type: "PURCHASE",
          description: `${service.name} number — ${country.name}`,
        },
      });

      return tx.activation.create({
        data: {
          userId: user.id,
          serviceSlug: service.slug,
          serviceName: service.name,
          countrySlug: country.slug,
          countryName: country.name,
          phoneNumber: assigned.phoneNumber,
          priceKobo,
          deliverAt: new Date(now.getTime() + assigned.deliverInSeconds * 1000),
          expiresAt: new Date(now.getTime() + assigned.sessionSeconds * 1000),
        },
      });
    });

    return { activationId: activation.id };
  } catch (err) {
    if (err instanceof Error && err.message === "insufficient_balance") {
      return { error: "insufficient_balance" };
    }
    return { error: "unknown" };
  }
}

export interface ActivationState {
  id: string;
  serviceName: string;
  countryName: string;
  phoneNumber: string;
  priceKobo: number;
  status: "WAITING" | "RECEIVED" | "EXPIRED" | "CANCELLED";
  code: string | null;
  expiresAt: string;
}

function toState(activation: {
  id: string;
  serviceName: string;
  countryName: string;
  phoneNumber: string;
  priceKobo: number;
  status: string;
  code: string | null;
  expiresAt: Date;
}): ActivationState {
  return {
    id: activation.id,
    serviceName: activation.serviceName,
    countryName: activation.countryName,
    phoneNumber: activation.phoneNumber,
    priceKobo: activation.priceKobo,
    status: activation.status as ActivationState["status"],
    code: activation.code,
    expiresAt: activation.expiresAt.toISOString(),
  };
}

export async function getActivationStateAction(
  activationId: string,
): Promise<ActivationState | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const activation = await prisma.activation.findFirst({
    where: { id: activationId, userId: session.user.id },
  });
  if (!activation) return null;

  const now = new Date();

  if (activation.status === "WAITING" && now >= activation.expiresAt) {
    const expired = await prisma.activation.update({
      where: { id: activation.id },
      data: { status: "EXPIRED" },
    });
    await creditWallet(
      session.user.id,
      activation.priceKobo,
      "REFUND",
      `Refund — no code received for ${activation.serviceName}`,
    );
    return toState(expired);
  }

  if (activation.status === "WAITING" && now >= activation.deliverAt) {
    const received = await prisma.activation.update({
      where: { id: activation.id },
      data: {
        status: "RECEIVED",
        code: generateVerificationCode(),
        receivedAt: now,
      },
    });
    return toState(received);
  }

  return toState(activation);
}

export async function cancelActivationAction(activationId: string): Promise<ActivationState | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const activation = await prisma.activation.findFirst({
    where: { id: activationId, userId: session.user.id },
  });
  if (!activation || activation.status !== "WAITING") return null;

  const cancelled = await prisma.activation.update({
    where: { id: activation.id },
    data: { status: "CANCELLED" },
  });

  await creditWallet(
    session.user.id,
    activation.priceKobo,
    "REFUND",
    `Refund — cancelled ${activation.serviceName} activation`,
  );

  return toState(cancelled);
}
