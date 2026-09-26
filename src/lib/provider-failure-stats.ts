import { prisma } from "@/lib/prisma";

/**
 * Per (provider, service, country) purchase-failure tracking, for the admin
 * "provider failure monitoring" panel. Deliberately separate from
 * ProviderSyncStatus (which is about catalog *sync* health, one row per
 * provider) — this is about real purchase attempts failing for one specific
 * combination, which a whole-provider status can't show.
 *
 * Never read by the buy flow: availability is always decided live against
 * the provider (see Activation's own pricing-snapshot comment), so this can
 * only ever inform a human looking at the admin panel, never suppress or
 * fabricate what a customer is offered.
 */
const CONSECUTIVE_FAILS_TO_FLAG = 5;

export async function recordPurchaseFailure(
  providerId: string,
  serviceSlug: string,
  countrySlug: string,
  reason: string,
): Promise<void> {
  const existing = await prisma.providerFailureStat.findUnique({
    where: { providerId_serviceSlug_countrySlug: { providerId, serviceSlug, countrySlug } },
    select: { consecutiveFails: true, flaggedAt: true },
  });
  const consecutiveFails = (existing?.consecutiveFails ?? 0) + 1;

  await prisma.providerFailureStat.upsert({
    where: { providerId_serviceSlug_countrySlug: { providerId, serviceSlug, countrySlug } },
    create: {
      providerId,
      serviceSlug,
      countrySlug,
      consecutiveFails: 1,
      totalFails: 1,
      lastFailureAt: new Date(),
      lastFailureReason: reason,
    },
    update: {
      consecutiveFails,
      totalFails: { increment: 1 },
      lastFailureAt: new Date(),
      lastFailureReason: reason,
      flaggedAt:
        consecutiveFails >= CONSECUTIVE_FAILS_TO_FLAG && !existing?.flaggedAt
          ? new Date()
          : undefined,
    },
  });
}

export async function recordPurchaseSuccess(
  providerId: string,
  serviceSlug: string,
  countrySlug: string,
): Promise<void> {
  await prisma.providerFailureStat.upsert({
    where: { providerId_serviceSlug_countrySlug: { providerId, serviceSlug, countrySlug } },
    create: {
      providerId,
      serviceSlug,
      countrySlug,
      consecutiveFails: 0,
      lastSuccessAt: new Date(),
    },
    update: {
      consecutiveFails: 0,
      flaggedAt: null,
      lastSuccessAt: new Date(),
    },
  });
}

export async function listFlaggedFailures() {
  return prisma.providerFailureStat.findMany({
    where: { flaggedAt: { not: null } },
    orderBy: { flaggedAt: "desc" },
    take: 50,
  });
}
