import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  getEnabledProviders,
  resolveProvider,
  getProviderDefinition,
  type NumberProvider,
  type ProviderCatalogEntry,
} from "@/lib/provider";
import { brandIcons } from "@/data/brand-icons";
import { loadMarginRules, quoteFor, isUsableCost } from "@/lib/pricing";

/**
 * The background job behind "browsing is fast, buying is live."
 *
 * Runs on a schedule (see /api/cron/sync-provider), never on a request a
 * customer is waiting on. For each enabled provider it asks that provider's
 * own adapter for its full catalog through the same NumberProvider
 * interface every other caller uses (getServices, then getCountries per
 * service, or getFullCatalog when the adapter has one), prices every offer
 * through the same centralized pricing engine quotePair() uses, and
 * replaces that provider's own SyncedOffer rows wholesale, scoped by
 * providerId, so a read never mixes rows from two runs and one provider's
 * sync can never touch another's cached rows.
 *
 * What this does NOT do: decide what a customer is charged. That is
 * quotePair() in src/lib/inventory.ts, which never reads SyncedOffer and
 * always asks the live provider(s) directly, right before a purchase. A
 * sync outage makes browsing degrade (searchServices/getServiceCountries
 * fall back to a live call, see inventory.ts) or, in the worst case, makes
 * the displayed catalog and prices stale for a while. It can never make a
 * purchase wrong, because the purchase path does not depend on this table
 * at all.
 */

/** Rows per INSERT statement. Each row binds parameters; Postgres caps a
 *  single statement at 65535, and this leaves a wide margin. Kept modest
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
 * enters a price, it only decides the in_stock/low/out_of_stock bucket and
 * is shown as a raw figure to admins, so a garbage value here is safe to
 * cap rather than needing to discard an otherwise perfectly priceable row
 * over it.
 */
const MAX_SAFE_STOCK_COUNT = 1_000_000;

function safeStockCount(count: number | undefined): number {
  if (!Number.isFinite(count) || count === undefined || count < 0) return 0;
  return Math.min(Math.trunc(count), MAX_SAFE_STOCK_COUNT);
}

type OfferRow = {
  providerId: string;
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
 * Writes one provider's offers as a sequence of ordinary upserts,
 * deliberately not inside one long-held transaction.
 *
 * Wrapping a full deleteMany() plus every chunked createMany() in a single
 * prisma.$transaction() holds one pooled connection for the entire write.
 * This project's own Postgres connection is explicitly a PgBouncer-style
 * pooled one (see prisma7.config.ts, which exists precisely because a
 * pooled connection cannot reliably hold a session-scoped lock for long): a
 * transaction held open for the length of a large catalog write is exactly
 * the shape of thing that can stall waiting for a connection back from a
 * small pool, in a way a client-side transaction timeout does not reliably
 * catch on every Prisma driver adapter.
 *
 * Each statement below is a single INSERT ... ON CONFLICT DO UPDATE: it
 * acquires a connection, runs, and releases it, immediately, before the
 * next chunk starts. Existing pairs are updated in place (matched on the
 * serviceSlug/countrySlug/providerId unique constraint), not deleted and
 * recreated, so a stable id is kept across syncs. A pair this provider's
 * previous sync wrote but this one did not see gets removed afterward, by
 * timestamp and providerId, in removeStaleOffers() below.
 */
async function upsertOffers(rows: OfferRow[], runStartedAt: Date): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const values = Prisma.join(
      chunk.map(
        (row) => Prisma.sql`(${randomUUID()}, ${row.providerId}, ${row.serviceSlug}, ${row.serviceName}, ${row.serviceColor}, ${row.category}, ${row.countrySlug}, ${row.countryName}, ${row.countryFlag}, ${row.dialCode}, ${row.nationalDigits}, ${row.costKobo}, ${row.priceKobo}, ${row.stock}, ${row.stockCount}, ${runStartedAt})`,
      ),
    );

    await prisma.$executeRaw`
      INSERT INTO "synced_offers"
        ("id", "providerId", "serviceSlug", "serviceName", "serviceColor", "category", "countrySlug", "countryName", "countryFlag", "dialCode", "nationalDigits", "costKobo", "priceKobo", "stock", "stockCount", "syncedAt")
      VALUES ${values}
      ON CONFLICT ("serviceSlug", "countrySlug", "providerId") DO UPDATE SET
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

/** Removes any pair this provider's previous sync wrote that this run did
 *  not see again, identified by not having been touched since runStartedAt.
 *  Scoped to this one provider's rows, so syncing GrizzlySMS can never
 *  remove a row another provider wrote. */
async function removeStaleOffers(providerId: string, runStartedAt: Date): Promise<number> {
  const result = await prisma.syncedOffer.deleteMany({
    where: { providerId, syncedAt: { lt: runStartedAt } },
  });
  return result.count;
}

export interface ProviderSyncResult {
  ok: boolean;
  /** Combined across every provider this run touched. Not deduplicated: a
   *  service two providers both sell counts twice. Good enough for "did
   *  this run do something"; see `providers` for the real per-provider
   *  breakdown a dashboard should actually display. */
  servicesSynced?: number;
  countriesSynced?: number;
  offersSynced?: number;
  error?: string;
  providers?: ProviderSyncOutcome[];
}

interface ProviderSyncOutcome {
  id: string;
  label: string;
  ok: boolean;
  servicesSynced?: number;
  countriesSynced?: number;
  offersSynced?: number;
  error?: string;
}

/**
 * Collects one provider's whole catalog.
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

/** Syncs exactly one provider's catalog into its own SyncedOffer rows and
 *  its own ProviderSyncStatus row. Failures here never touch another
 *  provider's rows or status. */
async function syncOneProvider(
  id: string,
  label: string,
  provider: NumberProvider,
): Promise<ProviderSyncOutcome> {
  const startedAt = Date.now();
  console.log(`[provider-sync] starting "${id}"`);

  try {
    const [rules, disabledRows, catalog] = await Promise.all([
      loadMarginRules(),
      prisma.serviceSetting.findMany({ where: { enabled: false } }),
      collectCatalog(provider),
    ]);
    console.log(
      `[provider-sync] "${id}" catalog fetched: ${catalog.length} raw entries (${Date.now() - startedAt}ms elapsed)`,
    );
    const disabled = new Set(disabledRows.map((row) => row.slug));

    const rows: OfferRow[] = [];
    const serviceSlugs = new Set<string>();
    const countrySlugs = new Set<string>();
    // The table has a unique constraint on (service, country, provider),
    // and a supplier can legitimately report the same pair twice across its
    // catalog; keeping the first occurrence avoids failing the whole write
    // on a duplicate.
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
        providerId: id,
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

    console.log(`[provider-sync] "${id}" ${rows.length} priceable offers after filtering, writing`);

    if (rows.length === 0) {
      const error = "Sync produced zero priceable offers; leaving the previous cache in place.";
      await recordFailure(id, error);
      return { id, label, ok: false, error };
    }

    // See upsertOffers()'s own comment for why this is a sequence of short
    // upserts rather than one held transaction. SyncedOffer is a browsing
    // cache only, so nothing here can touch an order or a wallet, and a
    // pair the supplier dropped simply stops being listed while every
    // historical Activation row keeps the price it was actually sold at.
    const runStartedAt = new Date();
    await upsertOffers(rows, runStartedAt);
    const staleRemoved = await removeStaleOffers(id, runStartedAt);
    console.log(
      `[provider-sync] "${id}" write complete, removed ${staleRemoved} stale offers (${Date.now() - startedAt}ms total)`,
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
      where: { id },
      create: { id, lastSuccessAt: new Date(), ...stats },
      // Cleared on success so a stale error from an older run cannot keep
      // showing against a catalog that is now current.
      update: { lastSuccessAt: new Date(), lastFailureError: null, ...stats },
    });

    return { id, label, ok: true, ...stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error.";
    await recordFailure(id, message);
    return { id, label, ok: false, error: message };
  }
}

/**
 * Syncs one provider by id, or every enabled provider when called with no
 * argument (what the daily cron and a bare "Sync now" do). Each provider is
 * synced in its own pass, sequentially, so one provider's failure cannot
 * abort another's, and one provider's connection issue never touches
 * another's cached rows.
 */
export async function runProviderSync(providerId?: string): Promise<ProviderSyncResult> {
  if (providerId) {
    const definition = getProviderDefinition(providerId);
    if (!definition) {
      const error = `Unknown provider "${providerId}".`;
      return { ok: false, error };
    }

    const resolution = await resolveProvider(providerId);
    if (!resolution.connected) {
      const error = `Provider not connected (${resolution.reason}).`;
      await recordFailure(providerId, error);
      return { ok: false, error, providers: [{ id: providerId, label: definition.label, ok: false, error }] };
    }

    const outcome = await syncOneProvider(providerId, definition.label, resolution.provider);
    return {
      ok: outcome.ok,
      servicesSynced: outcome.servicesSynced,
      countriesSynced: outcome.countriesSynced,
      offersSynced: outcome.offersSynced,
      error: outcome.error,
      providers: [outcome],
    };
  }

  const enabled = await getEnabledProviders();
  if (enabled.length === 0) {
    return { ok: false, error: "Provider not connected (not_configured)." };
  }

  const outcomes: ProviderSyncOutcome[] = [];
  for (const { id, label, provider } of enabled) {
    outcomes.push(await syncOneProvider(id, label, provider));
  }

  const ok = outcomes.every((outcome) => outcome.ok);
  return {
    ok,
    servicesSynced: outcomes.reduce((sum, o) => sum + (o.servicesSynced ?? 0), 0),
    countriesSynced: outcomes.reduce((sum, o) => sum + (o.countriesSynced ?? 0), 0),
    offersSynced: outcomes.reduce((sum, o) => sum + (o.offersSynced ?? 0), 0),
    error: ok
      ? undefined
      : outcomes
          .filter((o) => !o.ok)
          .map((o) => `${o.label}: ${o.error}`)
          .join("; "),
    providers: outcomes,
  };
}

async function recordFailure(providerId: string, message: string): Promise<void> {
  console.error(`[provider-sync] "${providerId}":`, message);
  await prisma.providerSyncStatus
    .upsert({
      where: { id: providerId },
      create: { id: providerId, lastFailureAt: new Date(), lastFailureError: message },
      update: { lastFailureAt: new Date(), lastFailureError: message },
    })
    .catch((dbError) => {
      // The sync itself failing is already reported to the caller; failing
      // to also record that failure should not throw a second, more
      // confusing error on top of it.
      console.error("[provider-sync] failed to record sync failure:", dbError);
    });
}

/** How stale a provider's SyncedOffer rows are allowed to get before the
 *  browse/search path in inventory.ts stops trusting them and falls back to
 *  a live call. The schedule itself (vercel.json) is once daily: Vercel's
 *  Hobby plan refuses to deploy a project whose cron runs more than once a
 *  day, so that is the ceiling here too, not a choice. 36 hours, one and a
 *  half times that interval, so one missed run does not immediately degrade
 *  every page view, but a genuinely stuck sync does not go unnoticed for
 *  more than a day and a half either. Move this back down once the project
 *  is on a plan that allows a tighter cron schedule. */
export const SYNC_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export interface ProviderSyncStatusView {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureError: string | null;
  servicesSynced: number | null;
  countriesSynced: number | null;
  offersSynced: number | null;
  /** Whether this provider's SyncedOffer rows are fresh enough for the
   *  browse/search path to trust right now. */
  isFresh: boolean;
}

function toStatusView(
  row: {
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastFailureError: string | null;
    servicesSynced: number | null;
    countriesSynced: number | null;
    offersSynced: number | null;
  } | null,
): ProviderSyncStatusView {
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

/** Sync status for one specific provider. */
export async function getProviderSyncStatus(providerId: string): Promise<ProviderSyncStatusView> {
  const row = await prisma.providerSyncStatus.findUnique({ where: { id: providerId } });
  return toStatusView(row);
}

/** Sync status for every provider that has ever synced (or attempted to),
 *  keyed by provider id. Used by the admin Providers page so every
 *  registered provider's status can be shown in one read. */
export async function getAllProviderSyncStatuses(): Promise<Map<string, ProviderSyncStatusView>> {
  const rows = await prisma.providerSyncStatus.findMany();
  return new Map(rows.map((row) => [row.id, toStatusView(row)]));
}

/** Whether ANY enabled provider's cache is fresh enough for the browse
 *  path to trust the SyncedOffer table at all, without picking a single
 *  provider yet. inventory.ts uses this to decide cache vs. live fallback;
 *  which specific provider's rows to prefer for a given pair happens after,
 *  in inventory.ts itself. */
export async function anyProviderCacheFresh(): Promise<boolean> {
  const rows = await prisma.providerSyncStatus.findMany({
    where: { lastSuccessAt: { not: null } },
  });
  const now = Date.now();
  return rows.some((row) => row.lastSuccessAt && now - row.lastSuccessAt.getTime() < SYNC_STALE_AFTER_MS);
}
