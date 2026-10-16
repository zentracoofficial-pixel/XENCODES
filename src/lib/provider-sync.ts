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
import { loadMarginRules, quoteForProvider, isUsableUsdCost } from "@/lib/pricing";
import { getDefaultCurrency } from "@/lib/currency-config";
import { checkProviderBalance } from "@/lib/provider-balance-monitor";
import { isRestrictedService } from "@/lib/restricted-services";

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
 * The same integer-overflow lesson as isUsableUsdCost() in pricing.ts,
 * applied to the other supplier-controlled number written to this table:
 * stock count. Confirmed as a second, separate real failure mode in
 * production, with a different anomalous value (3411291350) than the cost
 * overflow this file's isUsableUsdCost() check already catches, and the
 * same Postgres "value out of range for type integer" error.
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

/**
 * Keeps every distinct, priceable offer a provider actually reports, even
 * when two of its own country ids happen to slugify to the identical pair
 * key — which, for a provider in GrizzlySMS's API family, is exactly the
 * shape a second, separately-priced, separately-stocked quality pool for
 * the same country takes when the supplier gives it no "(2)"-style suffix
 * of its own: two different providerCountryId values reporting under the
 * same plain name. SyncedOffer's own unique constraint is
 * (serviceSlug, countrySlug, providerId), so without this, the second one
 * would silently overwrite — or never even reach — the first, with nothing
 * in any log to say a whole second pool of real, currently-sellable
 * inventory (sometimes the pricier, better-quality one in a "cheap vs.
 * quality" split like the one this file was built to preserve) went
 * missing. See src/lib/country-variant.ts for why a "(N)" suffix is the
 * right shape to invent here: the recommendation system in
 * src/lib/country-recommendation.ts already knows how to compare two
 * variants of one country on their real delivery record, not on price —
 * this is just what lets it ever see both in the first place.
 *
 * A true duplicate — the exact same providerCountryId appearing twice in
 * one catalog read — is still dropped silently, exactly as before: that is
 * the same inventory reported twice, not a second pool.
 *
 * `entries` must already be filtered to what is actually priceable and in
 * stock (see syncOneProvider): collision handling only needs to happen
 * among offers that would otherwise actually be written.
 */
export function dedupeCatalogEntries(
  entries: ProviderCatalogEntry[],
  providerId: string,
): ProviderCatalogEntry[] {
  const seenPairs = new Map<string, string | undefined>();
  const result: ProviderCatalogEntry[] = [];

  for (const entry of entries) {
    let country = entry.country;
    let pairKey = `${entry.service.slug}::${country.slug}`;

    if (seenPairs.has(pairKey)) {
      const keptProviderCountryId = seenPairs.get(pairKey);
      if (keptProviderCountryId === country.providerCountryId) {
        // The same provider country id, reported twice — nothing new to
        // sell, not a second pool.
        continue;
      }

      let suffix = 2;
      let candidateSlug = `${country.slug}-${suffix}`;
      while (seenPairs.has(`${entry.service.slug}::${candidateSlug}`)) {
        suffix += 1;
        candidateSlug = `${country.slug}-${suffix}`;
      }

      console.error(
        `[provider-sync] "${providerId}" reports two distinct country ids both named ` +
          `"${country.name}" for "${entry.service.slug}" (kept "${keptProviderCountryId ?? "unknown"}" ` +
          `first; this one is "${country.providerCountryId ?? "unknown"}") — keeping both rather than ` +
          `silently dropping real inventory, labelling this one "${country.name} (${suffix})".`,
      );

      country = { ...country, slug: candidateSlug, name: `${country.name} (${suffix})` };
      pairKey = `${entry.service.slug}::${candidateSlug}`;
    }

    seenPairs.set(pairKey, country.providerCountryId);
    result.push(country === entry.country ? entry : { ...entry, country });
  }

  return result;
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
  costUsdCents: number;
  /** Illustrative price only, in the platform's default currency. See
   *  SyncedOffer.priceKobo's own doc comment in prisma/schema.prisma. */
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
        (row) => Prisma.sql`(${randomUUID()}, ${row.providerId}, ${row.serviceSlug}, ${row.serviceName}, ${row.serviceColor}, ${row.category}, ${row.countrySlug}, ${row.countryName}, ${row.countryFlag}, ${row.dialCode}, ${row.nationalDigits}, ${row.costUsdCents}, ${row.priceKobo}, ${row.stock}, ${row.stockCount}, ${runStartedAt})`,
      ),
    );

    await prisma.$executeRaw`
      INSERT INTO "synced_offers"
        ("id", "providerId", "serviceSlug", "serviceName", "serviceColor", "category", "countrySlug", "countryName", "countryFlag", "dialCode", "nationalDigits", "costUsdCents", "priceKobo", "stock", "stockCount", "syncedAt")
      VALUES ${values}
      ON CONFLICT ("serviceSlug", "countrySlug", "providerId") DO UPDATE SET
        "serviceName" = EXCLUDED."serviceName",
        "serviceColor" = EXCLUDED."serviceColor",
        "category" = EXCLUDED."category",
        "countryName" = EXCLUDED."countryName",
        "countryFlag" = EXCLUDED."countryFlag",
        "dialCode" = EXCLUDED."dialCode",
        "nationalDigits" = EXCLUDED."nationalDigits",
        "costUsdCents" = EXCLUDED."costUsdCents",
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
async function removeStaleOffers(providerId: string, runStartedAt: Date, onlyCountries?: string[]): Promise<number> {
  if (onlyCountries && onlyCountries.length === 0) return 0;
  const result = await prisma.syncedOffer.deleteMany({
    where: {
      providerId,
      syncedAt: { lt: runStartedAt },
      ...(onlyCountries ? { countrySlug: { in: onlyCountries } } : {}),
    },
  });
  return result.count;
}

/** Deletes any cached offer for a service this platform does not sell. The
 *  sync no longer writes them; this clears ones cached before the rule, or
 *  by an older catalog. Browsing already hides them either way. */
export async function removeRestrictedOffers(): Promise<number> {
  const names = await prisma.syncedOffer.findMany({
    distinct: ["serviceSlug"],
    select: { serviceSlug: true, serviceName: true },
  });
  const slugs = names.filter((row) => isRestrictedService(row.serviceSlug, row.serviceName)).map((row) => row.serviceSlug);
  if (slugs.length === 0) return 0;
  const result = await prisma.syncedOffer.deleteMany({ where: { serviceSlug: { in: slugs } } });
  return result.count;
}

/** What one sync did: "success" read everything; "partial" refreshed part
 *  of the catalog and kept the last good data for the rest; "failed"
 *  changed nothing; "skipped" did not start because a sync of that server
 *  was already running. */
export type SyncResultKind = "success" | "partial" | "failed" | "skipped";

export interface ProviderSyncResult {
  ok: boolean;
  /** Across every provider this run touched: "success" when all of them
   *  fully synced, "failed" when none changed anything, "partial" between. */
  result?: SyncResultKind;
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

export interface ProviderSyncOutcome {
  id: string;
  label: string;
  ok: boolean;
  result: SyncResultKind;
  servicesSynced?: number;
  countriesSynced?: number;
  offersSynced?: number;
  /** For a provider read country by country (Server II). */
  countriesRead?: number;
  countriesTotal?: number;
  durationMs?: number;
  /** What the admin is told about this run. Safe to show: no raw API text. */
  message?: string;
  error?: string;
  /** When this provider last fully synced, after this run. */
  lastSuccessAt?: string | null;
}

export type SyncTrigger = "manual" | "manual_all" | "cron";

/** Longest a sync may run inside one request (the platform's limit is 60s);
 *  a lock older than this belongs to a run that died. */
const SYNC_LOCK_STALE_MS = 10 * 60 * 1000;
/** How long a provider read country by country keeps reading before it
 *  writes what it has, so the whole request ends inside the 60-second
 *  limit with room for the database writes. */
const SNAPSHOT_READ_BUDGET_MS = 44_000;

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
interface CollectedCatalog {
  entries: ProviderCatalogEntry[];
  /** Set when only these countries were read: everything else keeps its
   *  rows. Absent when the whole catalog was read. */
  countriesRead?: string[];
  countriesFailed?: string[];
  countriesTotal?: number;
  rateLimited?: boolean;
}

async function collectCatalog(id: string, provider: NumberProvider, deadline: number): Promise<CollectedCatalog> {
  if (provider.getCatalogSnapshot) {
    // Countries refreshed longest ago first, so repeated runs work through
    // the whole list even when one run cannot read every country.
    const ages = await prisma.syncedOffer.groupBy({
      by: ["countrySlug"],
      where: { providerId: id },
      _max: { syncedAt: true },
    });
    const countryOrder = ages
      .sort((a, b) => (a._max.syncedAt?.getTime() ?? 0) - (b._max.syncedAt?.getTime() ?? 0))
      .map((row) => row.countrySlug);
    const snapshot = await provider.getCatalogSnapshot({ deadline, countryOrder });
    return snapshot;
  }
  if (provider.getFullCatalog) return { entries: await provider.getFullCatalog() };

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
        costUsdCents: offer.costUsdCents,
        stock: offer.stock,
        stockCount: offer.stockCount,
      });
    }
  }

  return { entries };
}

/** Syncs exactly one provider's catalog into its own SyncedOffer rows and
 *  its own ProviderSyncStatus row. Failures here never touch another
 *  provider's rows or status. */
export async function syncOneProvider(
  id: string,
  label: string,
  provider: NumberProvider,
  trigger: SyncTrigger,
  deadline: number,
): Promise<ProviderSyncOutcome> {
  const startedAt = Date.now();
  const started = new Date(startedAt);

  // One sync per provider at a time. The claim is a single conditional
  // UPDATE, so two clicks (or a click racing the cron) cannot both pass.
  await prisma.providerSyncStatus.upsert({ where: { id }, create: { id }, update: {} });
  const claimed = await prisma.providerSyncStatus.updateMany({
    where: {
      id,
      OR: [{ runningSince: null }, { runningSince: { lt: new Date(startedAt - SYNC_LOCK_STALE_MS) } }],
    },
    data: { runningSince: started, lastStartedAt: started },
  });
  if (claimed.count === 0) {
    const status = await prisma.providerSyncStatus.findUnique({ where: { id } });
    const message = `A sync of ${label} is already running${
      status?.runningSince ? ` (started ${status.runningSince.toISOString()})` : ""
    }. Its result will show here when it ends.`;
    return { id, label, ok: false, result: "skipped", message, error: message, durationMs: 0 };
  }

  console.log(`[provider-sync] starting "${id}" (${trigger})`);
  let outcome: ProviderSyncOutcome;
  try {
    outcome = await runOneSync(id, label, provider, startedAt, deadline);
  } catch (error) {
    // Never shown raw: a provider's own error text can carry anything.
    const detail = error instanceof Error ? error.message : "Unknown sync error.";
    console.error(`[provider-sync] "${id}" failed:`, detail);
    outcome = {
      id,
      label,
      ok: false,
      result: "failed",
      error: safeSyncMessage(detail),
      message: `${safeSyncMessage(detail)} Nothing was changed; the last synced data is still in use.`,
    };
  }
  const finished = new Date();
  outcome.durationMs = finished.getTime() - startedAt;

  const status = await prisma.providerSyncStatus.update({
    where: { id },
    data: {
      runningSince: null,
      lastFinishedAt: finished,
      lastDurationMs: outcome.durationMs,
      lastResult: outcome.result,
      lastMessage: outcome.message ?? null,
      ...(outcome.result === "failed"
        ? { lastFailureAt: finished, lastFailureError: outcome.error ?? outcome.message ?? null }
        : {}),
    },
  });
  outcome.lastSuccessAt = status.lastSuccessAt?.toISOString() ?? null;
  await prisma.providerSyncRun
    .create({
      data: {
        providerId: id,
        trigger,
        startedAt: started,
        finishedAt: finished,
        durationMs: outcome.durationMs,
        result: outcome.result,
        servicesSynced: outcome.servicesSynced ?? null,
        countriesSynced: outcome.countriesSynced ?? null,
        offersSynced: outcome.offersSynced ?? null,
        countriesTotal: outcome.countriesTotal ?? null,
        countriesRead: outcome.countriesRead ?? null,
        message: outcome.message ?? null,
      },
    })
    .catch((error) => console.error("[provider-sync] could not record the run:", error));
  return outcome;
}

/** The sync itself: read, validate, write. Throws when nothing could be
 *  written; the caller records that as a failed run. */
async function runOneSync(
  id: string,
  label: string,
  provider: NumberProvider,
  startedAt: number,
  deadline: number,
): Promise<ProviderSyncOutcome> {
  {
    const [rules, disabledRows, collected, defaultCurrency, previous] = await Promise.all([
      loadMarginRules(),
      prisma.serviceSetting.findMany({ where: { enabled: false } }),
      collectCatalog(id, provider, deadline),
      getDefaultCurrency(),
      prisma.providerSyncStatus.findUnique({ where: { id } }),
    ]);
    const catalog = collected.entries;
    const partialRead = collected.countriesRead !== undefined;
    console.log(
      `[provider-sync] "${id}" catalog fetched: ${catalog.length} raw entries${
        partialRead ? `, ${collected.countriesRead!.length}/${collected.countriesTotal} countries read` : ""
      } (${Date.now() - startedAt}ms elapsed)`,
    );
    if (partialRead && collected.countriesRead!.length === 0) {
      throw new Error(
        collected.rateLimited
          ? `${label} is limiting how fast it can be asked (rate limited), so no country could be read.`
          : `${label} did not return prices for any country.`,
      );
    }
    const disabled = new Set(disabledRows.map((row) => row.slug));

    const rows: OfferRow[] = [];
    const serviceSlugs = new Set<string>();
    const countrySlugs = new Set<string>();

    const priceable = catalog.filter(
      (entry) =>
        !disabled.has(entry.service.slug) &&
        // Services this platform never sells (trading and investments,
        // gambling, tobacco, alcohol, adult, dating): see src/lib/restricted-services.ts.
        !isRestrictedService(entry.service.slug, entry.service.name) &&
        entry.stock !== "out_of_stock" &&
        // An unusable cost means an unknowable margin, so there is no price
        // to cache against it. Dropped rather than guessed.
        isUsableUsdCost(entry.costUsdCents),
    );
    // See dedupeCatalogEntries()'s own comment: this is what keeps a second,
    // identically-named country pool (a real, separately-priced, separately-
    // stocked quality tier GrizzlySMS gave no "(2)"-style suffix of its own)
    // from silently overwriting — or never even reaching — the first one,
    // the table's (service, country, provider) unique constraint would
    // otherwise collide them into.
    const deduped = dedupeCatalogEntries(priceable, id);

    for (const entry of deduped) {
      // The same centralized engine every displayed and charged price goes
      // through, converted here into the platform's default currency purely
      // for this browsing/highlight cache; quotePair() always recomputes
      // fresh in the buyer's own currency at purchase time.
      const quote = quoteForProvider(rules, id, entry.costUsdCents, entry.service.slug, null, defaultCurrency);
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
        costUsdCents: entry.costUsdCents,
        priceKobo: quote.customerPriceKobo,
        stock: entry.stock,
        stockCount: safeStockCount(entry.stockCount),
      });
    }

    console.log(`[provider-sync] "${id}" ${rows.length} priceable offers after filtering, writing`);

    if (rows.length === 0 && !partialRead) {
      throw new Error("The server returned nothing that can be sold.");
    }

    // A whole-catalog answer far smaller than the last good one is more
    // likely a bad answer than half the market vanishing overnight: write
    // what came back, but remove nothing.
    const previousOffers = previous?.offersSynced ?? 0;
    const shrunk = !partialRead && previousOffers >= 200 && rows.length < previousOffers / 2;

    // See upsertOffers()'s own comment for why this is a sequence of short
    // upserts rather than one held transaction. SyncedOffer is a browsing
    // cache only, so nothing here can touch an order or a wallet, and a
    // pair the supplier dropped simply stops being listed while every
    // historical Activation row keeps the price it was actually sold at.
    const runStartedAt = new Date();
    await upsertOffers(rows, runStartedAt);
    // Only what this run actually looked at can be stale: a country it did
    // not read keeps its rows, and a shrunken answer removes nothing.
    const staleRemoved = shrunk
      ? 0
      : await removeStaleOffers(id, runStartedAt, partialRead ? collected.countriesRead : undefined);
    const restrictedRemoved = await removeRestrictedOffers();
    if (restrictedRemoved > 0) {
      console.log(`[provider-sync] purged ${restrictedRemoved} cached offers for restricted services`);
    }
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

    const read = collected.countriesRead?.length;
    const total = collected.countriesTotal;
    const complete = !shrunk && (!partialRead || (read === total && (collected.countriesFailed?.length ?? 0) === 0));
    const result: SyncResultKind = complete ? "success" : "partial";
    const message = shrunk
      ? `Only ${rows.length} offers came back against ${previousOffers} last time, so nothing was removed. Sync again later.`
      : partialRead && !complete
        ? `${read} of ${total} countries refreshed this run${
            collected.rateLimited ? ` (${label} limits how fast prices can be read)` : ""
          }. The other countries keep their last synced prices; sync again to continue.`
        : `Synced ${stats.servicesSynced} services in ${stats.countriesSynced} countries (${stats.offersSynced} offers).`;

    if (complete) {
      // Cleared on success so a stale error from an older run cannot keep
      // showing against a catalog that is now current.
      await prisma.providerSyncStatus.update({
        where: { id },
        data: { lastSuccessAt: new Date(), lastFailureError: null, ...stats },
      });
    } else {
      const stored = await prisma.syncedOffer.count({ where: { providerId: id } });
      await prisma.providerSyncStatus.update({
        where: { id },
        data: { offersSynced: stored },
      });
    }

    return {
      id,
      label,
      ok: true,
      result,
      ...stats,
      ...(partialRead ? { countriesRead: read, countriesTotal: total } : {}),
      message,
    };
  }
}

/** A failure reason fit for the admin screen: short, and never a key, a
 *  URL with a key in it, or a raw response body. */
function safeSyncMessage(detail: string): string {
  const cleaned = detail
    .replace(/(api[_-]?key|token|secret|authorization)[=:]\s*\S+/gi, "$1=[hidden]")
    .replace(/https?:\/\/\S+/g, "[url]")
    .trim();
  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}...` : cleaned || "Sync failed.";
}

/**
 * Syncs one provider by id, or every enabled provider when called with no
 * argument (what the daily cron and "Sync all" do). Providers run side by
 * side, each in its own pass with its own lock and its own rows, so one
 * provider's failure cannot abort another's or touch its data, and both fit
 * inside one request's time limit.
 */
export async function runProviderSync(
  providerId?: string,
  options: {
    trigger?: SyncTrigger;
    /** How long a provider read country by country may read, when the
     *  caller has already used part of its request's time. */
    readBudgetMs?: number;
  } = {},
): Promise<ProviderSyncResult> {
  const deadline = Date.now() + Math.min(options.readBudgetMs ?? SNAPSHOT_READ_BUDGET_MS, SNAPSHOT_READ_BUDGET_MS);
  if (providerId) {
    const definition = getProviderDefinition(providerId);
    if (!definition) {
      const error = `Unknown provider "${providerId}".`;
      return { ok: false, result: "failed", error };
    }

    const resolution = await resolveProvider(providerId);
    if (!resolution.connected) {
      const error = `Not connected (${resolution.reason}). Check its keys in the deployment settings.`;
      await recordFailure(providerId, error);
      const outcome: ProviderSyncOutcome = { id: providerId, label: definition.label, ok: false, result: "failed", error, message: error };
      return { ok: false, result: "failed", error, providers: [outcome] };
    }

    // The balance check runs alongside the sync, not before it: it can take
    // several seconds, which a sync reading country by country cannot spare.
    const balance = checkProviderBalanceSafely(providerId, definition.label, resolution.provider);
    const outcome = await syncOneProvider(providerId, definition.label, resolution.provider, options.trigger ?? "manual", deadline);
    await balance;
    return summarize([outcome]);
  }

  const enabled = await getEnabledProviders();
  if (enabled.length === 0) {
    return { ok: false, result: "failed", error: "No server is enabled and connected." };
  }

  const outcomes = await Promise.all(
    enabled.map(async ({ id, label, provider }) => {
      const balance = checkProviderBalanceSafely(id, label, provider);
      const outcome = await syncOneProvider(id, label, provider, options.trigger ?? "manual_all", deadline);
      await balance;
      return outcome;
    }),
  );
  return summarize(outcomes);
}

/** One result for a run over one or more providers. */
export function summarize(outcomes: ProviderSyncOutcome[]): ProviderSyncResult {
  const result: SyncResultKind = outcomes.every((o) => o.result === "success")
    ? "success"
    : outcomes.some((o) => o.result === "success" || o.result === "partial")
      ? "partial"
      : outcomes.every((o) => o.result === "skipped")
        ? "skipped"
        : "failed";
  return {
    ok: result === "success",
    result,
    servicesSynced: outcomes.reduce((sum, o) => sum + (o.servicesSynced ?? 0), 0),
    countriesSynced: outcomes.reduce((sum, o) => sum + (o.countriesSynced ?? 0), 0),
    offersSynced: outcomes.reduce((sum, o) => sum + (o.offersSynced ?? 0), 0),
    error:
      result === "success"
        ? undefined
        : outcomes
            .filter((o) => o.result !== "success")
            .map((o) => `${o.label}: ${o.error ?? o.message ?? o.result}`)
            .join("; "),
    providers: outcomes,
  };
}

/**
 * Balance monitoring is observability riding along on the same daily sync,
 * not part of what the sync reports success/failure on — a supplier balance
 * check failing (or a bug in the monitor itself) must never make the
 * catalog sync itself look like it failed, or stop it from running.
 */
async function checkProviderBalanceSafely(
  providerId: string,
  label: string,
  provider: NumberProvider,
): Promise<void> {
  try {
    await checkProviderBalance(providerId, label, provider);
  } catch (error) {
    console.error(`[provider-sync] balance check threw for "${providerId}":`, error);
  }
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
  runningSince: Date | null;
  lastFinishedAt: Date | null;
  lastDurationMs: number | null;
  lastResult: string | null;
  lastMessage: string | null;
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
    runningSince?: Date | null;
    lastFinishedAt?: Date | null;
    lastDurationMs?: number | null;
    lastResult?: string | null;
    lastMessage?: string | null;
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
  const running =
    row?.runningSince && Date.now() - row.runningSince.getTime() < SYNC_LOCK_STALE_MS ? row.runningSince : null;
  return {
    runningSince: running,
    lastFinishedAt: row?.lastFinishedAt ?? null,
    lastDurationMs: row?.lastDurationMs ?? null,
    lastResult: row?.lastResult ?? null,
    lastMessage: row?.lastMessage ?? null,
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
