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

const SETTLED_STATUSES: ActivationStatus[] = ["RECEIVED", "EXPIRED", "CANCELLED", "REFUNDED"];

function toStat(received: number, settled: number): QualityStat | null {
  if (settled < MIN_SAMPLE_SIZE) return null;
  const rate = (received / settled) * 100;
  return {
    successRatePercent: Math.round(rate),
    tier: classifyQuality(rate),
    sampleSize: settled,
  };
}

/**
 * One service's completion rate broken down by country, from real settled
 * orders in the lookback window. Used by getServiceCountries() in
 * src/lib/inventory.ts to populate the country picker's existing (until now
 * always-empty) successRate field, and to sort a historically poor country
 * toward the back of the list rather than hide it — see
 * prioritizeCountryVariants() in src/lib/country-variant.ts for where that
 * ordering actually happens.
 *
 * One grouped query, not one query per country: a service with dozens of
 * countries would otherwise mean dozens of round trips on every buy-page
 * load.
 */
export async function getCountryQualityForService(
  serviceSlug: string,
): Promise<Map<string, QualityStat>> {
  const since = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.activation.groupBy({
    by: ["countrySlug", "status"],
    where: { serviceSlug, status: { in: SETTLED_STATUSES }, createdAt: { gte: since } },
    _count: { _all: true },
  });

  const byCountry = new Map<string, { received: number; settled: number }>();
  for (const row of rows) {
    const entry = byCountry.get(row.countrySlug) ?? { received: 0, settled: 0 };
    entry.settled += row._count._all;
    if (row.status === "RECEIVED") entry.received += row._count._all;
    byCountry.set(row.countrySlug, entry);
  }

  const result = new Map<string, QualityStat>();
  for (const [countrySlug, { received, settled }] of byCountry) {
    const stat = toStat(received, settled);
    if (stat) result.set(countrySlug, stat);
  }
  return result;
}

/** The same completion rate for one exact service/country pair, computed
 *  the same way as getCountryQualityForService() but for a single pair —
 *  used at the moment of purchase to decide whether to warn the customer,
 *  where fetching every other country's rate would be wasted work. */
export async function getPairQuality(
  serviceSlug: string,
  countrySlug: string,
): Promise<QualityStat | null> {
  const since = new Date(Date.now() - QUALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.activation.groupBy({
    by: ["status"],
    where: { serviceSlug, countrySlug, status: { in: SETTLED_STATUSES }, createdAt: { gte: since } },
    _count: { _all: true },
  });

  let received = 0;
  let settled = 0;
  for (const row of rows) {
    settled += row._count._all;
    if (row.status === "RECEIVED") received += row._count._all;
  }
  return toStat(received, settled);
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
      where: { status: { in: SETTLED_STATUSES }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.activation.groupBy({
      by: ["countrySlug", "status"],
      where: { status: { in: SETTLED_STATUSES }, createdAt: { gte: since } },
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
    const stat = toStat(received, settled);
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
    const stat = toStat(received, settled);
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
