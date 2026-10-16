import { prisma } from "@/lib/prisma";
import { readSettings, writeSetting, SETTING_KEYS } from "@/lib/settings";

/**
 * Smart Pickup: which provider to buy a number from, for one service in one
 * country, when more than one can sell it.
 *
 * It ranks by evidence, not by volume. Each provider's chance of delivering
 * a code for this exact pair is estimated from Xencodes' own finished orders,
 * shrunk toward that provider's record for the same service (any country)
 * and the same country (any service) when the pair itself has little
 * history, and then marked down by its own uncertainty, so a provider that
 * delivered 3 of 3 does not outrank one that delivered 95 of 100. Speed to
 * code, purchase reliability (numbers actually handed over, errors,
 * timeouts) and margin at the customer's price are weighed in too, with
 * admin-set weights. A provider failing too many purchase requests recently
 * is set aside until it recovers.
 *
 * When no provider has enough history for the pair, a configured default is
 * preferred, and a small configurable share of those orders goes to another
 * provider so the evidence that will decide later actually gets collected.
 *
 * Pure apart from loadPickupEvidence() and the settings readers, so the
 * scoring is tested directly. Never shown to customers.
 */

export interface SmartPickupSettings {
  enabled: boolean;
  /** Finished orders older than this are not evidence. */
  windowDays: number;
  /** Finished orders for the exact pair before its record is trusted. */
  minSample: number;
  /** How many orders' worth of weight the wider record carries. */
  priorStrength: number;
  /** Standard deviations taken off the delivery estimate for uncertainty. */
  riskAversion: number;
  weights: { success: number; availability: number; speed: number; cost: number };
  /** Preferred while no provider has enough history for a pair. */
  defaultProvider: string;
  /** Share (0–50%) of no-history orders sent to another provider to learn. */
  explorationPercent: number;
  health: { windowHours: number; minAttempts: number; maxFailurePercent: number };
  /** Move to the next provider when the first cannot sell (never after a
   *  request whose outcome is unknown). */
  fallback: boolean;
}

export const DEFAULT_SMART_PICKUP: SmartPickupSettings = {
  enabled: true,
  windowDays: 30,
  minSample: 20,
  priorStrength: 10,
  riskAversion: 1,
  weights: { success: 0.6, availability: 0.2, speed: 0.1, cost: 0.1 },
  defaultProvider: "grizzlysms",
  explorationPercent: 10,
  health: { windowHours: 6, minAttempts: 10, maxFailurePercent: 50 },
  fallback: true,
};

const num = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function parseSmartPickupSettings(raw: string | undefined): SmartPickupSettings {
  let value: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch {
    // Unreadable: defaults.
  }
  const d = DEFAULT_SMART_PICKUP;
  const w = (value.weights && typeof value.weights === "object" ? value.weights : {}) as Record<string, unknown>;
  const h = (value.health && typeof value.health === "object" ? value.health : {}) as Record<string, unknown>;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : d.enabled,
    windowDays: num(value.windowDays, d.windowDays, 1, 180),
    minSample: num(value.minSample, d.minSample, 1, 1000),
    priorStrength: num(value.priorStrength, d.priorStrength, 0, 200),
    riskAversion: num(value.riskAversion, d.riskAversion, 0, 3),
    weights: {
      success: num(w.success, d.weights.success, 0, 1),
      availability: num(w.availability, d.weights.availability, 0, 1),
      speed: num(w.speed, d.weights.speed, 0, 1),
      cost: num(w.cost, d.weights.cost, 0, 1),
    },
    defaultProvider: typeof value.defaultProvider === "string" && value.defaultProvider ? value.defaultProvider : d.defaultProvider,
    explorationPercent: num(value.explorationPercent, d.explorationPercent, 0, 50),
    health: {
      windowHours: num(h.windowHours, d.health.windowHours, 1, 168),
      minAttempts: num(h.minAttempts, d.health.minAttempts, 1, 1000),
      maxFailurePercent: num(h.maxFailurePercent, d.health.maxFailurePercent, 1, 100),
    },
    fallback: typeof value.fallback === "boolean" ? value.fallback : d.fallback,
  };
}

export async function readSmartPickupSettings(settings?: Record<string, string>): Promise<SmartPickupSettings> {
  return parseSmartPickupSettings((settings ?? (await readSettings()))[SETTING_KEYS.smartPickup]);
}

export async function writeSmartPickupSettings(value: SmartPickupSettings): Promise<void> {
  await writeSetting(SETTING_KEYS.smartPickup, JSON.stringify(parseSmartPickupSettings(JSON.stringify(value))));
}

// ---------------------------------------------------------------- evidence

export interface DeliveryRecord {
  /** Finished orders: delivered + no code. Customer cancellations are not counted. */
  settled: number;
  delivered: number;
}

export interface ProviderEvidence {
  pair: DeliveryRecord & { avgSecondsToCode: number | null };
  service: DeliveryRecord;
  country: DeliveryRecord;
  overall: DeliveryRecord;
  /** Purchase requests in the health window. */
  attempts: { total: number; ok: number; outOfStock: number; failed: number; avgLatencyMs: number | null };
}

export const NO_EVIDENCE: ProviderEvidence = {
  pair: { settled: 0, delivered: 0, avgSecondsToCode: null },
  service: { settled: 0, delivered: 0 },
  country: { settled: 0, delivered: 0 },
  overall: { settled: 0, delivered: 0 },
  attempts: { total: 0, ok: 0, outOfStock: 0, failed: 0, avgLatencyMs: null },
};

const SETTLED = ["RECEIVED", "EXPIRED", "REFUNDED"] as const;

/** Xencodes' own record for each provider, around one pair. */
export async function loadPickupEvidence(
  serviceSlug: string,
  countrySlug: string,
  providerIds: string[],
  settings: SmartPickupSettings,
): Promise<Map<string, ProviderEvidence>> {
  const since = new Date(Date.now() - settings.windowDays * 86_400_000);
  const healthSince = new Date(Date.now() - settings.health.windowHours * 3_600_000);
  const base = { provider: { in: providerIds }, createdAt: { gte: since }, status: { in: [...SETTLED] } };
  const group = (extra: Record<string, unknown>) =>
    prisma.activation.groupBy({ by: ["provider", "status"], where: { ...base, ...extra }, _count: { _all: true } });

  const [pair, service, country, overall, speed, attempts, latency] = await Promise.all([
    group({ serviceSlug, countrySlug }),
    group({ serviceSlug }),
    group({ countrySlug }),
    group({}),
    prisma.$queryRaw<Array<{ provider: string; seconds: number | null }>>`
      SELECT "provider", AVG(EXTRACT(EPOCH FROM ("receivedAt" - "createdAt")))::float AS seconds
      FROM "activations"
      WHERE "serviceSlug" = ${serviceSlug} AND "countrySlug" = ${countrySlug}
        AND "status" = 'RECEIVED' AND "receivedAt" IS NOT NULL AND "createdAt" >= ${since}
        AND "provider" = ANY(${providerIds})
      GROUP BY "provider"`,
    prisma.providerAttempt.groupBy({
      by: ["providerId", "outcome"],
      where: { providerId: { in: providerIds }, createdAt: { gte: healthSince } },
      _count: { _all: true },
    }),
    prisma.providerAttempt.groupBy({
      by: ["providerId"],
      where: { providerId: { in: providerIds }, createdAt: { gte: healthSince } },
      _avg: { latencyMs: true },
    }),
  ]);

  const record = (rows: Array<{ provider: string; status: string; _count: { _all: number } }>, id: string): DeliveryRecord => {
    let settled = 0;
    let delivered = 0;
    for (const row of rows) {
      if (row.provider !== id) continue;
      settled += row._count._all;
      if (row.status === "RECEIVED") delivered += row._count._all;
    }
    return { settled, delivered };
  };

  const out = new Map<string, ProviderEvidence>();
  for (const id of providerIds) {
    const tries = { total: 0, ok: 0, outOfStock: 0, failed: 0 };
    for (const row of attempts) {
      if (row.providerId !== id) continue;
      const n = row._count._all;
      tries.total += n;
      if (row.outcome === "ok") tries.ok += n;
      else if (row.outcome === "out_of_stock") tries.outOfStock += n;
      else if (row.outcome === "error" || row.outcome === "ambiguous") tries.failed += n;
    }
    out.set(id, {
      pair: { ...record(pair, id), avgSecondsToCode: speed.find((row) => row.provider === id)?.seconds ?? null },
      service: record(service, id),
      country: record(country, id),
      overall: record(overall, id),
      attempts: { ...tries, avgLatencyMs: latency.find((row) => row.providerId === id)?._avg.latencyMs ?? null },
    });
  }
  return out;
}

// ----------------------------------------------------------------- scoring

export interface PickupCandidate {
  providerId: string;
  evidence: ProviderEvidence;
  /** Profit share of the customer's price if this provider fills it (0–1). */
  marginShare: number;
}

export interface PickupScore {
  providerId: string;
  score: number;
  /** Estimated chance of delivering a code, after the uncertainty markdown. */
  success: number;
  availability: number;
  speed: number;
  cost: number;
  sample: number;
}

export interface PickupDecision {
  order: string[];
  mode: "single" | "disabled" | "scored" | "default" | "exploration";
  scores: PickupScore[];
  setAside: Array<{ providerId: string; reason: string }>;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const laplace = (r: DeliveryRecord) => (r.delivered + 1) / (r.settled + 2);

/** The delivery estimate for one provider and pair, with its uncertainty. */
export function deliveryEstimate(evidence: ProviderEvidence, settings: SmartPickupSettings) {
  const m = settings.priorStrength;
  const overall = laplace(evidence.overall);
  const toward = (r: DeliveryRecord, prior: number) => (r.delivered + m * prior) / (r.settled + m || 1);
  const prior = (toward(evidence.service, overall) + toward(evidence.country, overall)) / 2;
  const n = evidence.pair.settled;
  const mean = (evidence.pair.delivered + m * prior) / (n + m || 1);
  const sd = Math.sqrt((mean * (1 - mean)) / (n + m + 1));
  return { mean, sd, lower: clamp01(mean - settings.riskAversion * sd) };
}

export function scoreCandidate(candidate: PickupCandidate, settings: SmartPickupSettings): PickupScore {
  const { evidence } = candidate;
  const success = deliveryEstimate(evidence, settings).lower;
  // Numbers actually handed over per request, starting from a fair 80%.
  const a = evidence.attempts;
  const availability = (a.ok + 4) / (a.total + 5);
  const seconds = evidence.pair.avgSecondsToCode;
  const speed = seconds === null ? 0.5 : 1 / (1 + seconds / 120);
  const cost = clamp01(candidate.marginShare);
  const w = settings.weights;
  const total = w.success + w.availability + w.speed + w.cost || 1;
  const score = (w.success * success + w.availability * availability + w.speed * speed + w.cost * cost) / total;
  return { providerId: candidate.providerId, score, success, availability, speed, cost, sample: evidence.pair.settled };
}

/**
 * The order to try providers in for one purchase. `random` is injectable
 * for tests (0 <= random() < 1).
 */
export function rankProviders(
  candidates: PickupCandidate[],
  settings: SmartPickupSettings,
  random: () => number = Math.random,
): PickupDecision {
  if (candidates.length <= 1) {
    return { order: candidates.map((c) => c.providerId), mode: "single", scores: [], setAside: [] };
  }
  if (!settings.enabled) {
    return { order: candidates.map((c) => c.providerId), mode: "disabled", scores: [], setAside: [] };
  }

  const setAside: PickupDecision["setAside"] = [];
  const healthy = candidates.filter((c) => {
    const a = c.evidence.attempts;
    const failing = a.total >= settings.health.minAttempts && (a.failed / a.total) * 100 >= settings.health.maxFailurePercent;
    if (failing) setAside.push({ providerId: c.providerId, reason: `${a.failed} of ${a.total} recent requests failed` });
    return !failing;
  });
  // Never set every provider aside: then the ranking alone decides.
  const pool = healthy.length > 0 ? healthy : candidates;
  if (healthy.length === 0) setAside.length = 0;

  const scores = pool.map((c) => scoreCandidate(c, settings)).sort((x, y) => y.score - x.score);
  const ranked = scores.map((s) => s.providerId);
  const tail = setAside.map((s) => s.providerId);

  const enoughHistory = pool.some((c) => c.evidence.pair.settled >= settings.minSample);
  if (enoughHistory) return { order: [...ranked, ...tail], mode: "scored", scores, setAside };

  // Nobody has enough history for this pair: the safe default, except for
  // a small share sent elsewhere so the history gets built.
  const fallbackOrder = ranked.includes(settings.defaultProvider)
    ? [settings.defaultProvider, ...ranked.filter((id) => id !== settings.defaultProvider)]
    : ranked;
  const others = fallbackOrder.slice(1);
  if (others.length > 0 && random() * 100 < settings.explorationPercent) {
    const pick = others[Math.floor(random() * others.length) % others.length];
    return { order: [pick, ...fallbackOrder.filter((id) => id !== pick), ...tail], mode: "exploration", scores, setAside };
  }
  return { order: [...fallbackOrder, ...tail], mode: "default", scores, setAside };
}

// ---------------------------------------------------------------- recording

export type AttemptOutcome = "ok" | "out_of_stock" | "rejected" | "error" | "ambiguous";

/** One purchase request, whatever came of it. Never throws. */
export async function recordProviderAttempt(entry: {
  providerId: string;
  serviceSlug: string;
  countrySlug: string;
  outcome: AttemptOutcome;
  latencyMs: number;
  rank: number;
  providerOrderRef?: string | null;
  detail?: string | null;
  userId?: string | null;
}): Promise<void> {
  await prisma.providerAttempt
    .create({
      data: {
        ...entry,
        latencyMs: Math.max(0, Math.round(entry.latencyMs)),
        detail: entry.detail ? entry.detail.slice(0, 500) : null,
      },
    })
    .catch((error) => console.error("[smart-pickup] could not record attempt:", error));
}

// ------------------------------------------------------------------ report

export interface ProviderPerformance {
  providerId: string;
  orders: number;
  delivered: number;
  /** Delivered / (delivered + expired + provider-refunded). Null with none settled. */
  completionPercent: number | null;
  avgSecondsToCode: number | null;
  refunds: number;
  customerCancels: number;
  /** Provider cost of Naira-priced orders, in kobo. */
  providerCostKobo: number;
  attempts: number;
  purchaseSuccessPercent: number | null;
  outOfStock: number;
  rejected: number;
  failures: number;
  avgLatencyMs: number | null;
  firstChoiceSales: number;
  fallbackSales: number;
}

/** What each provider actually did over the window, from real orders and
 *  purchase requests only. For the admin. */
export async function getProviderPerformance(providerIds: string[], windowDays: number): Promise<ProviderPerformance[]> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const [orders, costs, speed, attempts, latency, sales] = await Promise.all([
    prisma.activation.groupBy({
      by: ["provider", "status"],
      where: { provider: { in: providerIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    // Naira orders only: a total across currencies would add unlike units.
    prisma.activation.groupBy({
      by: ["provider"],
      where: { provider: { in: providerIds }, createdAt: { gte: since }, currency: "NGN" },
      _sum: { providerCostKobo: true },
    }),
    prisma.$queryRaw<Array<{ provider: string; seconds: number | null }>>`
      SELECT "provider", AVG(EXTRACT(EPOCH FROM ("receivedAt" - "createdAt")))::float AS seconds
      FROM "activations"
      WHERE "status" = 'RECEIVED' AND "receivedAt" IS NOT NULL AND "createdAt" >= ${since}
        AND "provider" = ANY(${providerIds})
      GROUP BY "provider"`,
    prisma.providerAttempt.groupBy({
      by: ["providerId", "outcome"],
      where: { providerId: { in: providerIds }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.providerAttempt.groupBy({
      by: ["providerId"],
      where: { providerId: { in: providerIds }, createdAt: { gte: since } },
      _avg: { latencyMs: true },
    }),
    prisma.providerAttempt.groupBy({
      by: ["providerId", "rank"],
      where: { providerId: { in: providerIds }, createdAt: { gte: since }, outcome: "ok" },
      _count: { _all: true },
    }),
  ]);

  return providerIds.map((id) => {
    const mine = orders.filter((row) => row.provider === id);
    const count = (status: string) => mine.find((row) => row.status === status)?._count._all ?? 0;
    const delivered = count("RECEIVED");
    const noCode = count("EXPIRED") + count("REFUNDED");
    const tries = attempts.filter((row) => row.providerId === id);
    const tried = (outcome: string) => tries.find((row) => row.outcome === outcome)?._count._all ?? 0;
    const total = tries.reduce((sum, row) => sum + row._count._all, 0);
    const mySales = sales.filter((row) => row.providerId === id);
    return {
      providerId: id,
      orders: mine.reduce((sum, row) => sum + row._count._all, 0),
      delivered,
      completionPercent: delivered + noCode > 0 ? Math.round((delivered / (delivered + noCode)) * 1000) / 10 : null,
      avgSecondsToCode: speed.find((row) => row.provider === id)?.seconds ?? null,
      refunds: noCode,
      customerCancels: count("CANCELLED"),
      providerCostKobo: costs.find((row) => row.provider === id)?._sum.providerCostKobo ?? 0,
      attempts: total,
      purchaseSuccessPercent: total > 0 ? Math.round((tried("ok") / total) * 1000) / 10 : null,
      outOfStock: tried("out_of_stock"),
      rejected: tried("rejected"),
      failures: tried("error") + tried("ambiguous"),
      avgLatencyMs: latency.find((row) => row.providerId === id)?._avg.latencyMs ?? null,
      firstChoiceSales: mySales.filter((row) => row.rank === 0).reduce((sum, row) => sum + row._count._all, 0),
      fallbackSales: mySales.filter((row) => row.rank > 0).reduce((sum, row) => sum + row._count._all, 0),
    };
  });
}

/** Purchase requests whose outcome was never confirmed, newest first. */
export async function listAmbiguousAttempts(limit = 20) {
  return prisma.providerAttempt.findMany({
    where: { outcome: "ambiguous" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
