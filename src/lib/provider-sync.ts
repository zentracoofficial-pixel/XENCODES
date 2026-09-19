import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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

/** Rows per INSERT statement. Each row binds 15 parameters; Postgres caps
 *  a single statement at 65535, and this leaves a wide margin. Kept modest
 *  for another reason too: each statement is its own short-lived query
 *  against a pooled connection (see the comment on upsertOffers), and a
 *  smaller chunk means a smaller worst case if one chunk is ever slow. */
const WRITE_CHUNK_SIZE = 2_000;

/**
 * The same integer-overflow lesson as isUsableCost() in pricing.ts, applied
 * to the other supplier-controlled number written to this table: stock
 * count. Confirmed as a second, separate real failure mode in production,
 * with a different anomalous value (3411291350) than the cost overflow
 * this file's isUsableCost() check already catches, and the same Postgres
 * "value out of range for type integer" error.
 *
 * Clamped rather than dropped, unlike an unusable cost: stock count never
 * enters a price, it only decides the in_stock/low/out_of_stock bucket
 * (see GrizzlySmsProvider.stockFromCount) and is shown as a raw figure to
 * admins, so a garbage value here is safe to cap rather than needing to
 * discard an otherwise perfectly priceable row over it.
 */
const MAX_SAFE_STOCK_COUNT = 1_000_000;

function safeStockCount(count: number | undefined): number {
  if (!Number.isFinite(count) || count === undefined || count < 0) return 0;
  return Math.min(Math.trunc(count), MAX_SAFE_STOCK_COUNT);
}

type OfferRow = {
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
};

/**
 * Writes the catalog as a sequence of ordinary upserts, deliberately not
 * inside one long-held transaction.
 *
 * The previous version wrapped a full deleteMany() plus every chunked
 * createMany() in a single prisma.$transaction(), which holds one pooled
 * connection for the entire write. This project's own Postgres connection
 * is explicitly a PgBouncer-style pooled one (see prisma7.config.ts, which
 * exists precisely because a pooled connection cannot reliably hold a
 * session-scoped lock for long): a transaction held open for the length of
 * a large catalog write is exactly the shape of thing that can stall
 * waiting for a connection back from a small pool, in a way a client-side
 * transaction timeout does not reliably catch on every Prisma driver
 * adapter. That is a plausible explanation for a sync that hangs with no
 * error ever reaching the browser, which no amount of raising or lowering
 * that timeout number fixes, because the number was never the problem: the
 * held connection was.
 *
 * Each statement below is a single INSERT ... ON CONFLICT DO UPDATE: it
 * acquires a connection, runs, and releases it, immediately, before the
 * next chunk starts. Existing pairs are updated in place (matched on the
 * serviceSlug/countrySlug unique constraint), not deleted and recreated,
 * so a stable id is kept across syncs. A pair the previous sync wrote but
 * this one did not see gets removed afterward, by timestamp, in
 * removeStaleOffers() below, again as its own short statement rather than
 * inside this write.
 */
async function upsertOffers(rows: OfferRow[], runStartedAt: Date): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const values = Prisma.join(
      chunk.map(
        (row) => Prisma.sql`(${randomUUID()}, ${row.serviceSlug}, ${row.serviceName}, ${row.serviceColor}, ${row.category}, ${row.countrySlug}, ${row.countryName}, ${row.countryFlag}, ${row.dialCode}, ${row.nationalDigits}, ${row.costKobo}, ${row.priceKobo}, ${row.stock}, ${row.stockCount}, ${runStartedAt})`,
      ),
    );

    await prisma.$executeRaw`
      INSERT INTO "synced_offers"
        ("id", "serviceSlug", "serviceName", "serviceColor", "category", "countrySlug", "countryName", "countryFlag", "dialCode", "nationalDigits", "costKobo", "priceKobo", "stock", "stockCount", "syncedAt")
      VALUES ${values}
      ON CONFLICT ("serviceSlug", "countrySlug") DO UPDATE SET
        "serviceName" = EXCLUDED."serviceName",
        "serviceColor" = EXCLUDED."serviceColor",
        "category" = EXCLUDED."category",
        "countryName" = EXCLUDED."countryName",
        "countryFlag" = EXCLUDED."countryFlag",
        "dialCode" = EXCLUDED."dialCode",
        "nationalDigits" = EXCLUDED."nationalDigits",
        "costKobo" = EXCLUDED."costKobo",
        "priceKobo" = EXCLUDED."priceKobo",
        "stock" = EXCLUDED."stock",
        "stockCount" = EXCLUDED."stockCount",
        "syncedAt" = EXCLUDED."syncedAt"
    `;
    console.log(
      `[provider-sync] wrote ${Math.min(i + WRITE_CHUNK_SIZE, rows.length)}/${rows.length} offers`,
    );
  }
}

/** Removes any pair a previous sync wrote that this run did not see again,
 *  identified purely by not having been touched since runStartedAt. Run
 *  after every upsert has landed, so this can never remove a row this same
 *  run just wrote. */
async function removeStaleOffers(runStartedAt: Date): Promise<number> {
  const result = await prisma.syncedOffer.deleteMany({
    where: { syncedAt: { lt: runStartedAt } },
  });
  return result.count;
}

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
  const startedAt = Date.now();
  console.log("[provider-sync] starting");

  const resolved = await getNumberProvider();
  if (!resolved.connected) {
    const error = `Provider not connected (${resolved.reason}).`;
    await recordFailure(error);
    return { ok: false, error };
  }

  try {
    console.log(`[provider-sync] provider connected (${resolved.provider.id}), fetching catalog`);
    const [rules, disabledRows, catalog] = await Promise.all([
      loadMarginRules(),
      prisma.serviceSetting.findMany({ where: { enabled: false } }),
      collectCatalog(resolved.provider),
    ]);
    console.log(
      `[provider-sync] catalog fetched: ${catalog.length} raw entries (${Date.now() - startedAt}ms elapsed)`,
    );
    const disabled = new Set(disabledRows.map((row) => row.slug));

    const rows: OfferRow[] = [];
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
        stockCount: safeStockCount(entry.stockCount),
      });
    }

    console.log(`[provider-sync] ${rows.length} priceable offers after filtering, writing`);

    if (rows.length === 0) {
      const error =
        "Sync produced zero priceable offers; leaving the previous cache in place.";
      await recordFailure(error);
      return { ok: false, error };
    }

    // See upsertOffers()'s own comment for why this is a sequence of short
    // upserts rather than one held transaction. SyncedOffer is a browsing
    // cache only, so nothing here can touch an order or a wallet, and a
    // pair the supplier dropped simply stops being listed while every
    // historical Activation row keeps the price it was actually sold at.
    const runStartedAt = new Date();
    await upsertOffers(rows, runStartedAt);
    const staleRemoved = await removeStaleOffers(runStartedAt);
    console.log(
      `[provider-sync] write complete, removed ${staleRemoved} stale offers (${Date.now() - startedAt}ms total)`,
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
