import { prisma } from "@/lib/prisma";
import {
  QUALITY_LOOKBACK_DAYS,
  RECENT_LOOKBACK_DAYS,
  MIN_SAMPLE_SIZE,
  MIN_RECENT_SAMPLE_SIZE,
  SETTLED_STATUSES,
  EXCLUDE_CUSTOMER_CANCELLED,
  toStat,
  pickEffectiveStat,
  type QualityStat,
  type QualityTier,
} from "@/lib/deliverability";

/**
 * Real, measured quality one level more specific than
 * src/lib/deliverability.ts: not just "this country for this service", but
 * "this exact seller/pool GrizzlySMS's getPricesV3 reports behind that pair"
 * (see ProviderPool in src/lib/provider/types.ts). Confirmed against a live
 * response on a real account: GrizzlySMS can report several distinct pools
 * for one country+service, each with its own price and stock — the same
 * multiple price points a customer sees directly on GrizzlySMS's own site.
 * Nothing about the statistic itself is new; this is the exact same
 * 90-day/14-day, sample-size-gated methodology deliverability.ts already
 * uses, applied with providerOfferId added to the grouping key.
 *
 * The one new decision this file makes — selectQualityPool() — is the
 * actual "quality over cheapest" rule: never active until real evidence
 * exists, never assuming a pricier pool is better, and only diverging from
 * GrizzlySMS's own default assignment once one pool has a confirmed,
 * materially better delivery record than its current alternatives.
 */

async function tallyPoolPair(
  serviceSlug: string,
  countrySlug: string,
  providerOfferId: string,
  sinceDate: Date,
): Promise<{ received: number; settled: number }> {
  const rows = await prisma.activation.groupBy({
    by: ["status"],
    where: {
      serviceSlug,
      countrySlug,
      providerOfferId,
      status: { in: SETTLED_STATUSES },
      createdAt: { gte: sinceDate },
      ...EXCLUDE_CUSTOMER_CANCELLED,
    },
    _count: { _all: true },
  });

  let received = 0;
  let settled = 0;
  for (const row of rows) {
    settled += row._count._all;
    if (row.status === "RECEIVED") received += row._count._all;
  }
  return { received, settled };
}

/** Real quality for one exact (service, country, pool) — used wherever a
 *  single already-known pool's own track record is needed. */
export async function getPoolQuality(
  serviceSlug: string,
  countrySlug: string,
  providerOfferId: string,
): Promise<QualityStat | null> {
  const overallSince = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentSince = new Date(Date.now() - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [overallTally, recentTally] = await Promise.all([
    tallyPoolPair(serviceSlug, countrySlug, providerOfferId, overallSince),
    tallyPoolPair(serviceSlug, countrySlug, providerOfferId, recentSince),
  ]);

  const overall = toStat(overallTally.received, overallTally.settled, MIN_SAMPLE_SIZE);
  const recent = toStat(recentTally.received, recentTally.settled, MIN_RECENT_SAMPLE_SIZE);
  return pickEffectiveStat(overall, recent);
}

/** Every rated pool for one exact service+country, in one batched pair of
 *  queries rather than one per pool — same reasoning as
 *  getCountryQualityForService()'s own comment in deliverability.ts. */
export async function getPoolQualityForPair(
  serviceSlug: string,
  countrySlug: string,
): Promise<Map<string, QualityStat>> {
  const overallSince = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentSince = new Date(Date.now() - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const where = (sinceDate: Date) => ({
    serviceSlug,
    countrySlug,
    providerOfferId: { not: null },
    status: { in: SETTLED_STATUSES },
    createdAt: { gte: sinceDate },
    ...EXCLUDE_CUSTOMER_CANCELLED,
  });

  const [overallRows, recentRows] = await Promise.all([
    prisma.activation.groupBy({
      by: ["providerOfferId", "status"],
      where: where(overallSince),
      _count: { _all: true },
    }),
    prisma.activation.groupBy({
      by: ["providerOfferId", "status"],
      where: where(recentSince),
      _count: { _all: true },
    }),
  ]);

  function tally(rows: typeof overallRows): Map<string, { received: number; settled: number }> {
    const byPool = new Map<string, { received: number; settled: number }>();
    for (const row of rows) {
      if (!row.providerOfferId) continue;
      const entry = byPool.get(row.providerOfferId) ?? { received: 0, settled: 0 };
      entry.settled += row._count._all;
      if (row.status === "RECEIVED") entry.received += row._count._all;
      byPool.set(row.providerOfferId, entry);
    }
    return byPool;
  }

  const overallByPool = tally(overallRows);
  const recentByPool = tally(recentRows);
  const poolIds = new Set([...overallByPool.keys(), ...recentByPool.keys()]);

  const result = new Map<string, QualityStat>();
  for (const poolId of poolIds) {
    const overallTally = overallByPool.get(poolId);
    const recentTally = recentByPool.get(poolId);
    const overall = overallTally ? toStat(overallTally.received, overallTally.settled, MIN_SAMPLE_SIZE) : null;
    const recent = recentTally ? toStat(recentTally.received, recentTally.settled, MIN_RECENT_SAMPLE_SIZE) : null;
    const effective = pickEffectiveStat(overall, recent);
    if (effective) result.set(poolId, effective);
  }
  return result;
}

/**
 * Every rated pool for every country of ONE service, in a single grouped
 * pair of queries: countrySlug -> poolId -> stat. The same statistic as
 * getPoolQualityForPair(), batched so a whole country list can be priced the
 * way each country's live quote will be without one query per country.
 */
export async function getPoolQualityByCountryForService(
  serviceSlug: string,
): Promise<Map<string, Map<string, QualityStat>>> {
  const overallSince = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentSince = new Date(Date.now() - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const where = (sinceDate: Date) => ({
    serviceSlug,
    providerOfferId: { not: null },
    status: { in: SETTLED_STATUSES },
    createdAt: { gte: sinceDate },
    ...EXCLUDE_CUSTOMER_CANCELLED,
  });

  const [overallRows, recentRows] = await Promise.all([
    prisma.activation.groupBy({ by: ["countrySlug", "providerOfferId", "status"], where: where(overallSince), _count: { _all: true } }),
    prisma.activation.groupBy({ by: ["countrySlug", "providerOfferId", "status"], where: where(recentSince), _count: { _all: true } }),
  ]);

  function tally(rows: typeof overallRows): Map<string, { received: number; settled: number }> {
    const byKey = new Map<string, { received: number; settled: number }>();
    for (const row of rows) {
      if (!row.providerOfferId) continue;
      const key = `${row.countrySlug}::${row.providerOfferId}`;
      const entry = byKey.get(key) ?? { received: 0, settled: 0 };
      entry.settled += row._count._all;
      if (row.status === "RECEIVED") entry.received += row._count._all;
      byKey.set(key, entry);
    }
    return byKey;
  }

  const overallByKey = tally(overallRows);
  const recentByKey = tally(recentRows);
  const result = new Map<string, Map<string, QualityStat>>();
  for (const key of new Set([...overallByKey.keys(), ...recentByKey.keys()])) {
    const o = overallByKey.get(key);
    const r = recentByKey.get(key);
    const effective = pickEffectiveStat(
      o ? toStat(o.received, o.settled, MIN_SAMPLE_SIZE) : null,
      r ? toStat(r.received, r.settled, MIN_RECENT_SAMPLE_SIZE) : null,
    );
    if (!effective) continue;
    const [countrySlug, poolId] = key.split("::");
    const byPool = result.get(countrySlug) ?? new Map<string, QualityStat>();
    byPool.set(poolId, effective);
    result.set(countrySlug, byPool);
  }
  return result;
}

let globalPoolQualityCache: { value: Map<string, QualityStat>; fetchedAt: number } | undefined;
const GLOBAL_POOL_QUALITY_TTL_MS = 60_000;

/**
 * Every rated pool across ALL services and countries: how each GrizzlySMS
 * seller id has delivered for Xencodes overall. A seller id is global, and a
 * single service+country pair almost never has the 8 settled orders needed to
 * rate a pool on its own, so this is what lets a seller that keeps failing be
 * demoted everywhere rather than being rediscovered as bad one country at a
 * time. Same 90-day/14-day, sample-gated statistic as every other figure in
 * this file. Cached for a minute: it ranks every quote, and one grouped query
 * per quote would be wasteful for a number that moves slowly.
 */
export async function getGlobalPoolQuality(): Promise<Map<string, QualityStat>> {
  if (globalPoolQualityCache && Date.now() - globalPoolQualityCache.fetchedAt < GLOBAL_POOL_QUALITY_TTL_MS) {
    return globalPoolQualityCache.value;
  }

  const overallSince = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentSince = new Date(Date.now() - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const where = (sinceDate: Date) => ({
    providerOfferId: { not: null },
    status: { in: SETTLED_STATUSES },
    createdAt: { gte: sinceDate },
    ...EXCLUDE_CUSTOMER_CANCELLED,
  });

  const [overallRows, recentRows] = await Promise.all([
    prisma.activation.groupBy({ by: ["providerOfferId", "status"], where: where(overallSince), _count: { _all: true } }),
    prisma.activation.groupBy({ by: ["providerOfferId", "status"], where: where(recentSince), _count: { _all: true } }),
  ]);

  function tally(rows: typeof overallRows): Map<string, { received: number; settled: number }> {
    const byPool = new Map<string, { received: number; settled: number }>();
    for (const row of rows) {
      if (!row.providerOfferId) continue;
      const entry = byPool.get(row.providerOfferId) ?? { received: 0, settled: 0 };
      entry.settled += row._count._all;
      if (row.status === "RECEIVED") entry.received += row._count._all;
      byPool.set(row.providerOfferId, entry);
    }
    return byPool;
  }

  const overallByPool = tally(overallRows);
  const recentByPool = tally(recentRows);
  const result = new Map<string, QualityStat>();
  for (const poolId of new Set([...overallByPool.keys(), ...recentByPool.keys()])) {
    const o = overallByPool.get(poolId);
    const r = recentByPool.get(poolId);
    const effective = pickEffectiveStat(
      o ? toStat(o.received, o.settled, MIN_SAMPLE_SIZE) : null,
      r ? toStat(r.received, r.settled, MIN_RECENT_SAMPLE_SIZE) : null,
    );
    if (effective) result.set(poolId, effective);
  }

  globalPoolQualityCache = { value: result, fetchedAt: Date.now() };
  return result;
}

/** At least this many currently-in-stock pools before there is anything to
 *  choose between at all. */
const MIN_POOLS_TO_COMPARE = 2;

/** How much better (percentage points) the best-rated pool's rate must be
 *  than the next-best rated pool's before it is worth deliberately
 *  diverging from GrizzlySMS's own default assignment to target it
 *  specifically. Set well above ordinary day-to-day noise, the same
 *  reasoning as RECENT_DEGRADATION_THRESHOLD_POINTS in deliverability.ts: a
 *  few points apart is not a real difference worth a customer paying for.
 *  Exported so the admin report below can mark a pool "preferred" using the
 *  exact same bar selectQualityPool() itself decides by, rather than a
 *  second copy of the number. */
export const MEANINGFUL_ADVANTAGE_POINTS = 15;

/**
 * The actual "quality over cheapest" decision. Returns null — meaning: there
 * is no real basis to prefer one pool over another, so buy exactly as
 * before this feature existed (GrizzlySMS's own default assignment, priced
 * from the single blended cost getPrices already gives) — in every one of
 * these cases:
 *
 *  - Fewer than two currently-in-stock pools to choose between at all.
 *  - Fewer than two of those pools have a real, sufficiently-sampled rate
 *    yet (see MIN_SAMPLE_SIZE/MIN_RECENT_SAMPLE_SIZE) — nothing meaningful
 *    to compare.
 *  - The best-rated pool's advantage over the next-best rated pool is
 *    smaller than MEANINGFUL_ADVANTAGE_POINTS — noise, not a real
 *    difference.
 *
 * Only once a pool has a confirmed, materially better real delivery record
 * than its current rated alternatives does this prefer it. Price is never
 * part of this decision directly — a cheap pool and an expensive one with
 * no history yet are treated identically (neither is preferred over the
 * other) — it only shows up afterward, as whatever the chosen pool happens
 * to cost.
 */
export function selectQualityPool<T extends { providerOfferId: string; stockCount: number }>(
  pools: T[],
  qualityByPool: Map<string, QualityStat>,
): T | null {
  const available = pools.filter((pool) => pool.stockCount > 0);
  if (available.length < MIN_POOLS_TO_COMPARE) return null;

  const rated = available
    .map((pool) => ({ pool, stat: qualityByPool.get(pool.providerOfferId) }))
    .filter((entry): entry is { pool: T; stat: QualityStat } => entry.stat !== undefined)
    .sort((a, b) => b.stat.successRatePercent - a.stat.successRatePercent);

  if (rated.length < MIN_POOLS_TO_COMPARE) return null;

  const [best, runnerUp] = rated;
  if (best.stat.successRatePercent - runnerUp.stat.successRatePercent < MEANINGFUL_ADVANTAGE_POINTS) {
    return null;
  }

  return best.pool;
}

export interface PoolQualityRow {
  serviceSlug: string;
  serviceName: string;
  countrySlug: string;
  countryName: string;
  providerOfferId: string;
  successRatePercent: number;
  tier: QualityTier;
  sampleSize: number;
  /** True for at most one pool per (service, country) group: the one
   *  selectQualityPool() would currently actually choose — leading its
   *  group by at least MEANINGFUL_ADVANTAGE_POINTS. A group where no pool
   *  clears that bar still lists every rated pool, just with none marked
   *  preferred, matching selectQualityPool()'s own "not enough of an edge
   *  yet, change nothing" rule exactly — this is meant to answer "is this
   *  actually doing anything yet", not just "what has data". */
  preferred: boolean;
}

/**
 * Every pool with enough real settled history to rate, optionally narrowed
 * to one service — the shared computation behind both getPoolQualityReport()
 * (the admin-facing view, every service) and
 * getPreferredPoolQualityForService() (one service, customer-facing), so
 * the two can never quietly disagree about which pool selectQualityPool()
 * would actually choose. Computed the identical way as selectQualityPool()
 * itself (same 90-day/14-day blend, same sample-size gates, same
 * MEANINGFUL_ADVANTAGE_POINTS bar). Returns an empty array, not an error,
 * when nothing has enough history yet — expected for every pair on day one
 * of this feature existing, and for most pairs for a good while after.
 */
async function computePoolQualityRows(serviceSlug?: string): Promise<PoolQualityRow[]> {
  const overallSince = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentSince = new Date(Date.now() - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const where = (sinceDate: Date) => ({
    ...(serviceSlug ? { serviceSlug } : {}),
    providerOfferId: { not: null },
    status: { in: SETTLED_STATUSES },
    createdAt: { gte: sinceDate },
    ...EXCLUDE_CUSTOMER_CANCELLED,
  });

  const [overallRows, recentRows, names] = await Promise.all([
    prisma.activation.groupBy({
      by: ["serviceSlug", "countrySlug", "providerOfferId", "status"],
      where: where(overallSince),
      _count: { _all: true },
    }),
    prisma.activation.groupBy({
      by: ["serviceSlug", "countrySlug", "providerOfferId", "status"],
      where: where(recentSince),
      _count: { _all: true },
    }),
    // One representative display name per (service, country) pair, read
    // separately — same reasoning as getQualityReport()'s own comment in
    // deliverability.ts: folding a display name into the groupBy above
    // would silently split one pair into several rows if its name was ever
    // edited mid-window.
    prisma.activation.findMany({
      where: {
        ...(serviceSlug ? { serviceSlug } : {}),
        providerOfferId: { not: null },
        createdAt: { gte: overallSince },
      },
      distinct: ["serviceSlug", "countrySlug"],
      select: { serviceSlug: true, serviceName: true, countrySlug: true, countryName: true },
    }),
  ]);

  function tally(
    rows: typeof overallRows,
  ): Map<string, { received: number; settled: number }> {
    const map = new Map<string, { received: number; settled: number }>();
    for (const row of rows) {
      if (!row.providerOfferId) continue;
      const key = `${row.serviceSlug}::${row.countrySlug}::${row.providerOfferId}`;
      const entry = map.get(key) ?? { received: 0, settled: 0 };
      entry.settled += row._count._all;
      if (row.status === "RECEIVED") entry.received += row._count._all;
      map.set(key, entry);
    }
    return map;
  }

  const overallByKey = tally(overallRows);
  const recentByKey = tally(recentRows);
  const allKeys = new Set([...overallByKey.keys(), ...recentByKey.keys()]);

  interface Entry {
    serviceSlug: string;
    countrySlug: string;
    providerOfferId: string;
    stat: QualityStat;
  }
  const entries: Entry[] = [];
  for (const key of allKeys) {
    const [serviceSlug, countrySlug, providerOfferId] = key.split("::");
    const overallTally = overallByKey.get(key);
    const recentTally = recentByKey.get(key);
    const overallStat = overallTally ? toStat(overallTally.received, overallTally.settled, MIN_SAMPLE_SIZE) : null;
    const recentStat = recentTally ? toStat(recentTally.received, recentTally.settled, MIN_RECENT_SAMPLE_SIZE) : null;
    const effective = pickEffectiveStat(overallStat, recentStat);
    if (effective) entries.push({ serviceSlug, countrySlug, providerOfferId, stat: effective });
  }

  const nameByPair = new Map(names.map((n) => [`${n.serviceSlug}::${n.countrySlug}`, n]));

  const byPair = new Map<string, Entry[]>();
  for (const entry of entries) {
    const pairKey = `${entry.serviceSlug}::${entry.countrySlug}`;
    const list = byPair.get(pairKey);
    if (list) list.push(entry);
    else byPair.set(pairKey, [entry]);
  }

  const rows: PoolQualityRow[] = [];
  for (const [pairKey, group] of byPair) {
    const sorted = [...group].sort((a, b) => b.stat.successRatePercent - a.stat.successRatePercent);
    const [best, runnerUp] = sorted;
    const preferredId =
      runnerUp && best.stat.successRatePercent - runnerUp.stat.successRatePercent >= MEANINGFUL_ADVANTAGE_POINTS
        ? best.providerOfferId
        : null;
    const name = nameByPair.get(pairKey);

    for (const entry of sorted) {
      rows.push({
        serviceSlug: entry.serviceSlug,
        serviceName: name?.serviceName ?? entry.serviceSlug,
        countrySlug: entry.countrySlug,
        countryName: name?.countryName ?? entry.countrySlug,
        providerOfferId: entry.providerOfferId,
        successRatePercent: entry.stat.successRatePercent,
        tier: entry.stat.tier,
        sampleSize: entry.stat.sampleSize,
        preferred: entry.providerOfferId === preferredId,
      });
    }
  }

  rows.sort((a, b) => {
    const pairCompare = `${a.serviceName}/${a.countryName}`.localeCompare(`${b.serviceName}/${b.countryName}`);
    if (pairCompare !== 0) return pairCompare;
    return b.successRatePercent - a.successRatePercent;
  });

  return rows;
}

/** The admin-facing view of every rated pool across every service — see
 *  computePoolQualityRows()'s own comment. */
export async function getPoolQualityReport(): Promise<PoolQualityRow[]> {
  return computePoolQualityRows();
}

/**
 * Per-country, the one pool (if any) that currently has a confirmed,
 * materially better delivery record than its country's other rated pools
 * for this service — the exact pool selectQualityPool() would route a
 * purchase to right now, computed the identical way.
 *
 * Exists because a country's blended rate across every pool GrizzlySMS has
 * ever served it from (getCountryQualityForService() in deliverability.ts)
 * can keep looking bad long after Xencodes has real evidence to route
 * around its worst pools — the customer-facing warning would otherwise
 * never reflect an improvement the backend already made. A country with no
 * confirmed best pool yet is simply absent here, so its caller falls back
 * to the honest blended figure exactly as before this existed.
 */
export async function getPreferredPoolQualityForService(
  serviceSlug: string,
): Promise<Map<string, QualityStat>> {
  const rows = await computePoolQualityRows(serviceSlug);
  const result = new Map<string, QualityStat>();
  for (const row of rows) {
    if (row.preferred) {
      result.set(row.countrySlug, {
        successRatePercent: row.successRatePercent,
        tier: row.tier,
        sampleSize: row.sampleSize,
      });
    }
  }
  return result;
}
