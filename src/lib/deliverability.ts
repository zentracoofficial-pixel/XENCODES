import { prisma } from "@/lib/prisma";
import type { ActivationStatus } from "@/generated/prisma/client";

/**
 * Real, measured delivery quality, computed only from Xencodes' own order
 * history — never fabricated, never estimated without data behind it.
 *
 * GrizzlySMS's API (see src/lib/provider/grizzlysms.ts) reports a cost and a
 * stock count for a service/country pair, and nothing else: no rating, no
 * success percentage, no completion metric of any kind. The `successRate`
 * field ProviderAvailability/InventoryCountry already carry (see
 * src/lib/provider/types.ts) exists for a provider that reports one; since
 * none does today, this file is the fallback the type's own doc comment
 * anticipates: a completion rate derived from Xencodes' own settled orders,
 * describing exactly the same real-world fact ("share of recent activations
 * that received a code") from a different, equally honest source.
 *
 * "Settled" means an activation that has actually finished, one way or the
 * other: RECEIVED (the code arrived), or EXPIRED/CANCELLED/REFUNDED (it did
 * not). A still-WAITING activation is excluded from every calculation here
 * because it has not finished yet and so says nothing about the outcome —
 * counting it as a failure would understate quality for anything with an
 * order in flight right now.
 */

/** How far back a rate looks. A pair's real-world reliability can change
 *  (a country's carrier routing, a provider's inventory mix), so this is a
 *  rolling window of recent outcomes, not lifetime history — matching the
 *  buy panel's own existing copy, "% of recent activations received a
 *  code", which this file is what actually computes. */
export const QUALITY_LOOKBACK_DAYS = 90;

/** Below this many settled activations for an exact pair, no rate is shown
 *  or acted on at all: a handful of orders is not enough to tell a
 *  genuinely unreliable country apart from ordinary bad luck, and showing a
 *  confident-looking percentage from 2 or 3 orders would be exactly the
 *  fabricated-looking measurement this file exists to avoid. */
export const MIN_SAMPLE_SIZE = 8;

/**
 * A second, shorter window used only to catch a pair whose performance has
 * recently gotten worse than its 90-day figure suggests — a provider's
 * inventory mix for a country can turn bad well inside a 90-day window, and
 * a customer deciding right now cares about "is this good today", not "was
 * this good on average over the last three months". Deliberately a smaller
 * minimum sample too: 14 days sees roughly a sixth of the traffic 90 days
 * does, so demanding the same 8 would mean this window almost never has a
 * say at all.
 *
 * This is intentionally a simple, transparent statistical rule — two
 * rolling windows and a threshold — not a model. See
 * pickEffectiveStat() below for exactly how the two windows are combined.
 */
export const RECENT_LOOKBACK_DAYS = 14;
export const MIN_RECENT_SAMPLE_SIZE = 4;

/** How many percentage points worse the recent window has to be before it
 *  overrides the 90-day figure. Small day-to-day swings in a handful of
 *  recent orders are expected noise, not a real change in quality; this is
 *  set well above that noise floor so only a genuine, material drop
 *  overrides the larger, steadier sample. */
const RECENT_DEGRADATION_THRESHOLD_POINTS = 15;

export type QualityTier = "high" | "medium" | "low";

/** The three bands the task's own examples use ("High Success", "Medium
 *  Success", "Low Success"). Boundaries are a judgment call, documented
 *  here as the one place they are decided: 85%+ is what a customer would
 *  reasonably call reliable, under 60% is bad enough to actively warn
 *  about, and everything between is a middling result worth surfacing
 *  plainly rather than dressing up as either extreme. */
export function classifyQuality(successRatePercent: number): QualityTier {
  if (successRatePercent >= 85) return "high";
  if (successRatePercent >= 60) return "medium";
  return "low";
}

export const QUALITY_TIER_LABEL: Record<QualityTier, string> = {
  high: "High success",
  medium: "Medium success",
  low: "Low success",
};

export interface QualityStat {
  /** 0 to 100, rounded to the nearest whole percent for display. */
  successRatePercent: number;
  tier: QualityTier;
  /** How many settled activations this is based on, so a caller can decide
   *  whether to trust/show it at all (see MIN_SAMPLE_SIZE). */
  sampleSize: number;
}

/** Every terminal outcome an activation can settle into — reused by
 *  src/lib/recovery.ts, which asks the same "did a code actually arrive"
 *  question about one customer's recent orders that this file asks about a
 *  service/country pair's. */
export const SETTLED_STATUSES: ActivationStatus[] = ["RECEIVED", "EXPIRED", "CANCELLED", "REFUNDED"];

/**
 * A customer's own voluntary cancellation (the Cancel button in
 * src/app/dashboard/buy/actions.ts, which sets refundReason to exactly this
 * value) is not a delivery failure: the order never got the chance to
 * succeed or fail, the customer simply ended it themselves. Counting it
 * among settled "no code" outcomes would drag down a country, service, or
 * pool's measured quality for something that says nothing about whether
 * GrizzlySMS would have delivered. Every other settled non-RECEIVED
 * outcome — expired, GrizzlySMS's own cancellation/refund, an admin refund
 * for any other reason — still counts, because those genuinely did fail to
 * deliver.
 *
 * Spread into a Prisma `where` alongside the status/date filters wherever
 * SETTLED_STATUSES is used for a quality calculation (never for the
 * business-reporting refundedCount/expiredCount figures in
 * getQualityReport()'s "overall" section, which already only count
 * REFUNDED/EXPIRED and are unaffected either way). Written as an explicit
 * OR rather than `refundReason: { not: "CANCELLED_BY_CUSTOMER" }` because
 * Prisma's `not` (and top-level `NOT`) follows SQL's three-valued NULL
 * logic and would incorrectly also exclude every row where refundReason is
 * null — i.e. every RECEIVED activation, which has no refund reason at
 * all. Confirmed against the real database before relying on it.
 */
export const EXCLUDE_CUSTOMER_CANCELLED = {
  OR: [{ refundReason: null }, { refundReason: { not: "CANCELLED_BY_CUSTOMER" as const } }],
};

/** Exported for src/lib/provider-pool-quality.ts, which applies this exact
 *  same statistic one level more specific (by provider pool, not just
 *  country) — one formula, never two copies that could quietly drift. */
export function toStat(received: number, settled: number, minSample: number): QualityStat | null {
  if (settled < minSample) return null;
  const rate = (received / settled) * 100;
  return {
    successRatePercent: Math.round(rate),
    tier: classifyQuality(rate),
    sampleSize: settled,
  };
}

/**
 * Combines the 90-day figure with the 14-day one into the single stat every
 * caller actually uses, per RECENT_LOOKBACK_DAYS's own comment above.
 *
 * The rule, in order:
 *  1. Neither window qualifies (too few settled orders either way) — nothing
 *     to report.
 *  2. Only one window qualifies — use it. This is what lets a country that
 *     is brand new (no 90-day history yet, but a handful of recent orders)
 *     or one whose 90-day sample just fell below the threshold still get a
 *     figure, and what lets a long-running country whose recent volume
 *     happens to be thin keep using its steadier 90-day figure.
 *  3. Both qualify and the recent window is at least
 *     RECENT_DEGRADATION_THRESHOLD_POINTS worse — use the recent one: a
 *     provider's inventory for this pair has gotten meaningfully worse
 *     lately, and the larger, older sample would otherwise hide that behind
 *     a still-decent-looking average.
 *  4. Both qualify and recent is not meaningfully worse — use the 90-day
 *     figure, the steadier of the two, rather than letting normal
 *     day-to-day noise in a small recent sample move the displayed number
 *     around.
 */
/** Exported for the same reason toStat() is above. */
export function pickEffectiveStat(
  overall: QualityStat | null,
  recent: QualityStat | null,
): QualityStat | null {
  if (!overall) return recent;
  if (!recent) return overall;
  const degraded = recent.successRatePercent <= overall.successRatePercent - RECENT_DEGRADATION_THRESHOLD_POINTS;
  return degraded ? recent : overall;
}

async function tallyByCountry(
  serviceSlug: string,
  sinceDate: Date,
): Promise<Map<string, { received: number; settled: number }>> {
  const rows = await prisma.activation.groupBy({
    by: ["countrySlug", "status"],
    where: {
      serviceSlug,
      status: { in: SETTLED_STATUSES },
      createdAt: { gte: sinceDate },
      ...EXCLUDE_CUSTOMER_CANCELLED,
    },
    _count: { _all: true },
  });

  const byCountry = new Map<string, { received: number; settled: number }>();
  for (const row of rows) {
    const entry = byCountry.get(row.countrySlug) ?? { received: 0, settled: 0 };
    entry.settled += row._count._all;
    if (row.status === "RECEIVED") entry.received += row._count._all;
    byCountry.set(row.countrySlug, entry);
  }
  return byCountry;
}

/**
 * One service's completion rate broken down by country, from real settled
 * orders — the 90-day figure, unless the last 14 days show a meaningfully
 * worse rate (see pickEffectiveStat() above). Used by getServiceCountries()
 * in src/lib/inventory.ts to populate the country picker's deliverability
 * figure, and by src/lib/country-recommendation.ts to decide which variant
 * of a country to recommend.
 *
 * Two grouped queries (one per window), not one query per country: a
 * service with dozens of countries would otherwise mean dozens of round
 * trips on every buy-page load. Both hit the same
 * (serviceSlug, countrySlug, createdAt) index.
 */
export async function getCountryQualityForService(
  serviceSlug: string,
): Promise<Map<string, QualityStat>> {
  const overallSince = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentSince = new Date(Date.now() - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [overallByCountry, recentByCountry] = await Promise.all([
    tallyByCountry(serviceSlug, overallSince),
    tallyByCountry(serviceSlug, recentSince),
  ]);

  const countrySlugs = new Set([...overallByCountry.keys(), ...recentByCountry.keys()]);
  const result = new Map<string, QualityStat>();
  for (const countrySlug of countrySlugs) {
    const overallTally = overallByCountry.get(countrySlug);
    const recentTally = recentByCountry.get(countrySlug);
    const overall = overallTally ? toStat(overallTally.received, overallTally.settled, MIN_SAMPLE_SIZE) : null;
    const recent = recentTally
      ? toStat(recentTally.received, recentTally.settled, MIN_RECENT_SAMPLE_SIZE)
      : null;
    const effective = pickEffectiveStat(overall, recent);
    if (effective) result.set(countrySlug, effective);
  }
  return result;
}

async function tallyPair(
  serviceSlug: string,
  countrySlug: string,
  sinceDate: Date,
): Promise<{ received: number; settled: number }> {
  const rows = await prisma.activation.groupBy({
    by: ["status"],
    where: {
      serviceSlug,
      countrySlug,
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

/** The same completion rate for one exact service/country pair, computed
 *  the same way as getCountryQualityForService() (90-day figure, unless the
 *  last 14 days show a meaningfully worse rate) but for a single pair —
 *  used at the moment of purchase to decide whether to warn the customer,
 *  where fetching every other country's rate would be wasted work. */
export async function getPairQuality(
  serviceSlug: string,
  countrySlug: string,
): Promise<QualityStat | null> {
  const overallSince = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentSince = new Date(Date.now() - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [overallTally, recentTally] = await Promise.all([
    tallyPair(serviceSlug, countrySlug, overallSince),
    tallyPair(serviceSlug, countrySlug, recentSince),
  ]);

  const overall = toStat(overallTally.received, overallTally.settled, MIN_SAMPLE_SIZE);
  const recent = toStat(recentTally.received, recentTally.settled, MIN_RECENT_SAMPLE_SIZE);
  return pickEffectiveStat(overall, recent);
}

export interface ServiceQualityRow {
  serviceSlug: string;
  serviceName: string;
  successRatePercent: number;
  tier: QualityTier;
  sampleSize: number;
  refundedCount: number;
  expiredCount: number;
}

export interface CountryQualityRow {
  countrySlug: string;
  countryName: string;
  successRatePercent: number;
  tier: QualityTier;
  sampleSize: number;
}

export interface QualityReport {
  windowDays: number;
  minSampleSize: number;
  /** Every service with enough settled orders to rate, worst first — the
   *  admin's "worst performing services" and "top performing services" are
   *  both this same list, read from either end. */
  services: ServiceQualityRow[];
  countries: CountryQualityRow[];
  /** Across every settled order in the window, regardless of sample size
   *  per pair — the platform-wide figures the per-pair minimum sample
   *  guard would otherwise hide from an admin who wants the whole picture. */
  overall: {
    settledCount: number;
    successRatePercent: number;
    refundedCount: number;
    refundRatePercent: number;
    expiredCount: number;
    expiredRatePercent: number;
  };
}

/**
 * The admin-facing quality report: every service and country with enough
 * real settled orders to say anything about, ranked by completion rate,
 * plus platform-wide totals. Real order data only — see the file's own
 * header for why a pair below MIN_SAMPLE_SIZE is left out of the ranked
 * lists entirely rather than shown with a misleadingly precise percentage.
 */
export async function getQualityReport(): Promise<QualityReport> {
  const since = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [serviceRows, countryRows, serviceNames, countryNames] = await Promise.all([
    prisma.activation.groupBy({
      by: ["serviceSlug", "status"],
      where: { status: { in: SETTLED_STATUSES }, createdAt: { gte: since }, ...EXCLUDE_CUSTOMER_CANCELLED },
      _count: { _all: true },
    }),
    prisma.activation.groupBy({
      by: ["countrySlug", "status"],
      where: { status: { in: SETTLED_STATUSES }, createdAt: { gte: since }, ...EXCLUDE_CUSTOMER_CANCELLED },
      _count: { _all: true },
    }),
    // One representative display name per slug, read separately rather
    // than folded into the groupBy above: grouping by name too would
    // silently split one service into several rows if its display name
    // was ever edited mid-window, double-counting the same slug.
    prisma.activation.findMany({
      where: { createdAt: { gte: since } },
      distinct: ["serviceSlug"],
      select: { serviceSlug: true, serviceName: true },
    }),
    prisma.activation.findMany({
      where: { createdAt: { gte: since } },
      distinct: ["countrySlug"],
      select: { countrySlug: true, countryName: true },
    }),
  ]);

  const serviceNameBySlug = new Map(serviceNames.map((row) => [row.serviceSlug, row.serviceName]));
  const countryNameBySlug = new Map(countryNames.map((row) => [row.countrySlug, row.countryName]));

  interface Tally {
    received: number;
    settled: number;
    refunded: number;
    expired: number;
  }
  function tally(entry: Tally | undefined, status: string, count: number): Tally {
    const next = entry ?? { received: 0, settled: 0, refunded: 0, expired: 0 };
    next.settled += count;
    if (status === "RECEIVED") next.received += count;
    if (status === "REFUNDED") next.refunded += count;
    if (status === "EXPIRED") next.expired += count;
    return next;
  }

  const byService = new Map<string, Tally>();
  for (const row of serviceRows) {
    byService.set(row.serviceSlug, tally(byService.get(row.serviceSlug), row.status, row._count._all));
  }
  const byCountry = new Map<string, Tally>();
  for (const row of countryRows) {
    byCountry.set(row.countrySlug, tally(byCountry.get(row.countrySlug), row.status, row._count._all));
  }

  const services: ServiceQualityRow[] = [];
  for (const [serviceSlug, { received, settled, refunded, expired }] of byService) {
    const stat = toStat(received, settled, MIN_SAMPLE_SIZE);
    if (!stat) continue;
    services.push({
      serviceSlug,
      serviceName: serviceNameBySlug.get(serviceSlug) ?? serviceSlug,
      successRatePercent: stat.successRatePercent,
      tier: stat.tier,
      sampleSize: stat.sampleSize,
      refundedCount: refunded,
      expiredCount: expired,
    });
  }
  services.sort((a, b) => a.successRatePercent - b.successRatePercent);

  const countries: CountryQualityRow[] = [];
  for (const [countrySlug, { received, settled }] of byCountry) {
    const stat = toStat(received, settled, MIN_SAMPLE_SIZE);
    if (!stat) continue;
    countries.push({
      countrySlug,
      countryName: countryNameBySlug.get(countrySlug) ?? countrySlug,
      successRatePercent: stat.successRatePercent,
      tier: stat.tier,
      sampleSize: stat.sampleSize,
    });
  }
  countries.sort((a, b) => a.successRatePercent - b.successRatePercent);

  let overallSettled = 0;
  let overallReceived = 0;
  let overallRefunded = 0;
  let overallExpired = 0;
  for (const { received, settled, refunded, expired } of byService.values()) {
    overallSettled += settled;
    overallReceived += received;
    overallRefunded += refunded;
    overallExpired += expired;
  }

  return {
    windowDays: QUALITY_LOOKBACK_DAYS,
    minSampleSize: MIN_SAMPLE_SIZE,
    services,
    countries,
    overall: {
      settledCount: overallSettled,
      successRatePercent: overallSettled > 0 ? Math.round((overallReceived / overallSettled) * 100) : 0,
      refundedCount: overallRefunded,
      refundRatePercent: overallSettled > 0 ? Math.round((overallRefunded / overallSettled) * 100) : 0,
      expiredCount: overallExpired,
      expiredRatePercent: overallSettled > 0 ? Math.round((overallExpired / overallSettled) * 100) : 0,
    },
  };
}
