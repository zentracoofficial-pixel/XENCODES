import { prisma } from "@/lib/prisma";
import { getNumberProvider, type NumberProvider, type ProviderCatalogEntry } from "@/lib/provider";
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

/** Rows per INSERT. One statement for a catalog that can run to tens of
 *  thousands of pairs risks exceeding the driver's parameter limit, so the
 *  write is chunked; all chunks still share one transaction. */
const WRITE_CHUNK_SIZE = 5_000;

export interface ProviderSyncResult {
  ok: boolean;
  servicesSynced?: number;
  countriesSynced?: number;
  offersSynced?: number;
  error?: string;
}

/**
 * Collects the supplier's whole catalog.
 *
 * Prefers the adapter's bulk read, which exists precisely so this does not
 * take one request per service: a several-hundred-service catalog walked
 * one service at a time does not finish inside a serverless function's time
 * limit, which is why a sync built that way never records a successful run.
 * The per-service walk stays as the fallback for an adapter with no bulk
 * endpoint, and produces identical data.
 */
async function collectCatalog(provider: NumberProvider): Promise<ProviderCatalogEntry[]> {
  if (provider.getFullCatalog) return provider.getFullCatalog();

  const services = await provider.getServices();
  const entries: ProviderCatalogEntry[] = [];

  for (const service of services) {
    let offers;
    try {
      offers = await provider.getCountries(service.slug);
    } catch (error) {
      // One unreadable service should not lose the rest of the catalog.
      console.error(`[provider-sync] getCountries failed for "${service.slug}":`, error);
      continue;
    }

    for (const offer of offers) {
      entries.push({
        service,
        country: offer.country,
        costKobo: offer.costKobo,
        stock: offer.stock,
        stockCount: offer.stockCount,
      });
    }
  }

  return entries;
}

export async function runProviderSync(): Promise<ProviderSyncResult> {
  const resolved = await getNumberProvider();
  if (!resolved.connected) {
    const error = `Provider not connected (${resolved.reason}).`;
    await recordFailure(error);
    return { ok: false, error };
  }

  try {
    const [rules, disabledRows, catalog] = await Promise.all([
      loadMarginRules(),
      prisma.serviceSetting.findMany({ where: { enabled: false } }),
      collectCatalog(resolved.provider),
    ]);
    const disabled = new Set(disabledRows.map((row) => row.slug));

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
    const serviceSlugs = new Set<string>();
    const countrySlugs = new Set<string>();
    // The table has a unique constraint on the pair, and a supplier can
    // legitimately report the same pair twice across its catalog; keeping
    // the first occurrence avoids failing the whole write on a duplicate.
    const seenPairs = new Set<string>();

    for (const entry of catalog) {
      if (disabled.has(entry.service.slug)) continue;
      if (entry.stock === "out_of_stock") continue;
      // An unusable cost means an unknowable margin, so there is no price
      // to cache against it. Dropped rather than guessed.
      if (!isUsableCost(entry.costKobo)) continue;

      const pairKey = `${entry.service.slug}::${entry.country.slug}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      // The same centralized engine every displayed and charged price goes
      // through. There is no second formula here.
      const quote = quoteFor(rules, entry.costKobo, entry.service.slug);
      serviceSlugs.add(entry.service.slug);
      countrySlugs.add(entry.country.slug);

      rows.push({
        serviceSlug: entry.service.slug,
        serviceName: entry.service.name,
        serviceColor: brandIcons[entry.service.slug]?.hex ?? entry.service.color,
        category: entry.service.category,
        countrySlug: entry.country.slug,
        countryName: entry.country.name,
        countryFlag: entry.country.flag,
        dialCode: entry.country.dialCode,
        nationalDigits: entry.country.nationalDigits,
        costKobo: entry.costKobo,
        priceKobo: quote.customerPriceKobo,
        stock: entry.stock,
        stockCount: entry.stockCount ?? 0,
      });
    }

    if (rows.length === 0) {
      const error =
        "Sync produced zero priceable offers; leaving the previous cache in place.";
      await recordFailure(error);
      return { ok: false, error };
    }

    // Atomic replace: readers see either the whole previous catalog or the
    // whole new one, never a half-written mix. SyncedOffer is a browsing
    // cache only, so nothing here can touch an order or a wallet, and a
    // pair the supplier dropped simply stops being listed while every
    // historical Activation row keeps the price it was actually sold at.
    await prisma.$transaction(
      async (tx) => {
        await tx.syncedOffer.deleteMany({});
        for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
          await tx.syncedOffer.createMany({ data: rows.slice(i, i + WRITE_CHUNK_SIZE) });
        }
      },
      // A full catalog is a large write, and the default transaction budget
      // is tuned for ordinary request-path work rather than this.
      { timeout: 120_000, maxWait: 15_000 },
    );

    const stats = {
      // Counted from what was actually priced and written, not from what
      // was asked about: a service the supplier listed but quoted nothing
      // for was not synchronized, and saying it was would overstate this.
      servicesSynced: serviceSlugs.size,
      countriesSynced: countrySlugs.size,
      offersSynced: rows.length,
    };

    await prisma.providerSyncStatus.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, lastSuccessAt: new Date(), ...stats },
      // Cleared on success so a stale error from an older run cannot keep
      // showing against a catalog that is now current.
      update: {
        lastSuccessAt: new Date(),
        lastFailureError: null,
        ...stats,
      },
    });

    return { ok: true, ...stats };
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
