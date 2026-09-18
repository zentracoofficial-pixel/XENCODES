import { prisma } from "@/lib/prisma";
import { getNumberProvider } from "@/lib/provider";
import { brandIcons } from "@/data/brand-icons";
import { loadMarginRules, quoteFor, isUsableCost } from "@/lib/pricing";

/**
 * The background job behind "browsing is fast, buying is live."
 *
 * Runs on a schedule (see /api/cron/sync-provider), never on a request a
 * customer is waiting on. It asks the connected supplier for its full
 * catalog through the same NumberProvider interface every other caller
 * uses (getServices, then getCountries per service), prices every offer
 * through the same centralized pricing engine quotePair() uses, and
 * replaces SyncedOffer wholesale so a read never mixes rows from two runs.
 *
 * What this does NOT do: decide what a customer is charged. That is
 * quotePair() in src/lib/inventory.ts, which never reads SyncedOffer and
 * always asks the supplier directly, right before a purchase. A sync
 * outage makes browsing degrade (searchServices/getServiceCountries fall
 * back to a live call, see inventory.ts) or, in the worst case, makes the
 * displayed catalog and prices stale for a while. It can never make a
 * purchase wrong, because the purchase path does not depend on this table
 * at all.
 */

const SINGLETON_ID = "singleton";

export interface ProviderSyncResult {
  ok: boolean;
  servicesSynced?: number;
  countriesSynced?: number;
  offersSynced?: number;
  error?: string;
}

export async function runProviderSync(): Promise<ProviderSyncResult> {
  const resolved = await getNumberProvider();
  if (!resolved.connected) {
    const error = `Provider not connected (${resolved.reason}).`;
    await recordFailure(error);
    return { ok: false, error };
  }

  try {
    const [rules, disabledRows, services] = await Promise.all([
      loadMarginRules(),
      prisma.serviceSetting.findMany({ where: { enabled: false } }),
      resolved.provider.getServices(),
    ]);
    const disabled = new Set(disabledRows.map((row) => row.slug));
    const enabledServices = services.filter((service) => !disabled.has(service.slug));

    const rows: {
      serviceSlug: string;
      serviceName: string;
      serviceColor: string;
      category: string;
      countrySlug: string;
      countryName: string;
      countryFlag: string;
      dialCode: string;
      nationalDigits: number;
      costKobo: number;
      priceKobo: number;
      stock: string;
      stockCount: number;
    }[] = [];
    const countrySlugs = new Set<string>();

    // Per-service, matching the same NumberProvider contract every other
    // caller uses (getCountries is scoped to one service, never global).
    // Sequential, not parallel: this runs on a schedule, not on a request
    // a customer is waiting on, and staying sequential keeps it from
    // opening dozens of concurrent connections to the supplier at once.
    for (const service of enabledServices) {
      let offers;
      try {
        offers = await resolved.provider.getCountries(service.slug);
      } catch (error) {
        console.error(`[provider-sync] getCountries failed for "${service.slug}":`, error);
        continue;
      }

      for (const offer of offers) {
        if (offer.stock === "out_of_stock") continue;
        if (!isUsableCost(offer.costKobo)) continue;

        const quote = quoteFor(rules, offer.costKobo, service.slug);
        countrySlugs.add(offer.country.slug);
        rows.push({
          serviceSlug: service.slug,
          serviceName: service.name,
          serviceColor: brandIcons[service.slug]?.hex ?? service.color,
          category: service.category,
          countrySlug: offer.country.slug,
          countryName: offer.country.name,
          countryFlag: offer.country.flag,
          dialCode: offer.country.dialCode,
          nationalDigits: offer.country.nationalDigits,
          costKobo: offer.costKobo,
          priceKobo: quote.customerPriceKobo,
          stock: offer.stock,
          stockCount: offer.stockCount ?? 0,
        });
      }
    }

    if (rows.length === 0) {
      const error = "Sync produced zero priceable offers; leaving the previous cache in place.";
      await recordFailure(error);
      return { ok: false, error };
    }

    await prisma.$transaction([
      prisma.syncedOffer.deleteMany({}),
      prisma.syncedOffer.createMany({ data: rows }),
    ]);

    await prisma.providerSyncStatus.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        lastSuccessAt: new Date(),
        servicesSynced: enabledServices.length,
        countriesSynced: countrySlugs.size,
        offersSynced: rows.length,
      },
      update: {
        lastSuccessAt: new Date(),
        servicesSynced: enabledServices.length,
        countriesSynced: countrySlugs.size,
        offersSynced: rows.length,
      },
    });

    return {
      ok: true,
      servicesSynced: enabledServices.length,
      countriesSynced: countrySlugs.size,
      offersSynced: rows.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error.";
    await recordFailure(message);
    return { ok: false, error: message };
  }
}

async function recordFailure(message: string): Promise<void> {
  console.error("[provider-sync]", message);
  await prisma.providerSyncStatus.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, lastFailureAt: new Date(), lastFailureError: message },
    update: { lastFailureAt: new Date(), lastFailureError: message },
  }).catch((dbError) => {
    // The sync itself failing is already reported to the caller; failing to
    // also record that failure should not throw a second, more confusing
    // error on top of it.
    console.error("[provider-sync] failed to record sync failure:", dbError);
  });
}

/** How stale SyncedOffer is allowed to get before the browse/search path
 *  in inventory.ts stops trusting it and falls back to a live call. The
 *  schedule itself (vercel.json) is once daily: Vercel's Hobby plan
 *  refuses to deploy a project whose cron runs more than once a day, so
 *  that is the ceiling here too, not a choice. 36 hours, one and a half
 *  times that interval, so one missed run does not immediately degrade
 *  every page view, but a genuinely stuck sync does not go unnoticed for
 *  more than a day and a half either. Move this back down once the
 *  project is on a plan that allows a tighter cron schedule. */
export const SYNC_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export interface ProviderSyncStatusView {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureError: string | null;
  servicesSynced: number | null;
  countriesSynced: number | null;
  offersSynced: number | null;
  /** Whether SyncedOffer is fresh enough for the browse/search path to
   *  trust right now. */
  isFresh: boolean;
}

export async function getProviderSyncStatus(): Promise<ProviderSyncStatusView> {
  const row = await prisma.providerSyncStatus.findUnique({ where: { id: SINGLETON_ID } });
  const isFresh = Boolean(
    row?.lastSuccessAt && Date.now() - row.lastSuccessAt.getTime() < SYNC_STALE_AFTER_MS,
  );
  return {
    lastSuccessAt: row?.lastSuccessAt ?? null,
    lastFailureAt: row?.lastFailureAt ?? null,
    lastFailureError: row?.lastFailureError ?? null,
    servicesSynced: row?.servicesSynced ?? null,
    countriesSynced: row?.countriesSynced ?? null,
    offersSynced: row?.offersSynced ?? null,
    isFresh,
  };
}
