import type { QualityStat } from "@/lib/deliverability";

/**
 * How one service+country pair is sold from GrizzlySMS's whole price ladder,
 * not from its single cheapest rung.
 *
 * GrizzlySMS sells one pair from many sellers ("pools"), each with its own
 * price and its own stock (WhatsApp/USA: $1 x20, $1.20 x36, $1.35 x1307,
 * $1.60 x954, $1.90 x19546, $3.13 x2462, $5 x100, and so on). getPrices only
 * ever reports the CHEAPEST rung's price next to a stock figure that is not
 * the cheapest rung's, so a quote built from it is priced at a rung holding a
 * few dozen numbers. The moment those few dozen are gone, GrizzlySMS answers
 * NO_NUMBERS to a request capped at that price although thousands of numbers
 * remain one rung up. That is the false "out of stock" this module exists to
 * end: a pair is out of stock only when EVERY rung is empty.
 *
 * rankPools() decides the order rungs are offered in. Pure and free of any
 * I/O, so it is the one rule both the quote and the purchase retry share.
 */

export interface RankablePool {
  providerOfferId: string;
  costUsdCents: number;
  stockCount: number;
}

/** A rung with fewer numbers than this is treated as thin: it can vanish
 *  between the quote and the purchase, so it is only tried after every deep
 *  rung. Not a quality judgement, a stability one. */
export const DEEP_POOL_MIN_STOCK = 50;

/** A rated pool below this success rate is not preferred over a pool with no
 *  record at all. Same line classifyQuality() draws between "medium" and
 *  "low" in deliverability.ts. */
export const ACCEPTABLE_RATE_POINTS = 60;

/** Rated pools within this many points of the best rated pool are treated as
 *  equals (same reasoning as MEANINGFUL_ADVANTAGE_POINTS in
 *  provider-pool-quality.ts: a few points is noise). */
const SAME_QUALITY_BAND_POINTS = 15;

/** How far above the typical price a rung may sit and still lead. Beyond
 *  this a rung is a luxury tier: tried after the sensible ones, not first, so
 *  a customer is not quoted well above the going price on a guess. */
export const PREMIUM_CAP_MULTIPLE = 1.25;

/** The price at which half of a pair's in-stock numbers cost less: where the
 *  bulk of the real supply sits, so a handful of numbers at one extreme
 *  cannot drag it. */
export function typicalPriceCents(pools: RankablePool[]): number {
  const live = pools.filter((pool) => pool.stockCount > 0 && pool.costUsdCents > 0);
  const total = live.reduce((sum, pool) => sum + pool.stockCount, 0);
  if (total === 0) return 0;
  let running = 0;
  for (const pool of [...live].sort((a, b) => a.costUsdCents - b.costUsdCents)) {
    running += pool.stockCount;
    if (running >= total / 2) return pool.costUsdCents;
  }
  return 0;
}

/**
 * Every in-stock rung, best first. Cheapest-first is exactly what this does
 * NOT do: the supplier's default (and the cheapest rung) is where bulk,
 * heavily reused numbers tend to sit, and a code that never arrives costs far
 * more than a dearer number that does.
 *
 *  1. Pools with a real, acceptable delivery record, best record first
 *     (only those within the same quality band as the best rated pool).
 *     Proven delivery beats any assumption about price, in either direction.
 *  2. Pools with no record yet and real depth, ordered by closeness to the
 *     typical price: at or just above typical (up to PREMIUM_CAP_MULTIPLE
 *     times it), nearest typical first; then the luxury tiers above that
 *     cap, cheapest of those first; then pools priced below typical, closest
 *     to typical first, cheapest last. Neither the cheapest rung (bulk,
 *     heavily reused numbers) nor the dearest (a high price is not evidence
 *     of a better number, and customers pay it) leads on a guess.
 *  3. Thin pools with no record, in the same order.
 *  4. Pools whose own record is poor or clearly worse than a rated
 *     alternative, last. Still offered as a final fallback: a poor number is
 *     better than a false "out of stock" when that really is all that is left.
 *
 * Closeness to typical is a rule of thumb for pools nothing is known about
 * yet, not a measurement. It stops mattering the moment a pool has settled
 * orders: the record in step 1 and the demotion in step 4 are what really
 * decide.
 */
export function rankPools<T extends RankablePool>(
  pools: T[],
  qualityByPool?: Map<string, QualityStat>,
): T[] {
  const available = pools.filter((pool) => pool.stockCount > 0 && pool.costUsdCents > 0);
  const typical = typicalPriceCents(available);

  const rate = (pool: T) => qualityByPool?.get(pool.providerOfferId)?.successRatePercent;
  const bestRated = available.reduce<number | undefined>((best, pool) => {
    const r = rate(pool);
    return r !== undefined && (best === undefined || r > best) ? r : best;
  }, undefined);

  const preferred: T[] = [];
  const unratedDeep: T[] = [];
  const unratedThin: T[] = [];
  const demoted: T[] = [];

  for (const pool of available) {
    const r = rate(pool);
    if (r === undefined) {
      (pool.stockCount >= DEEP_POOL_MIN_STOCK ? unratedDeep : unratedThin).push(pool);
    } else if (r >= ACCEPTABLE_RATE_POINTS && bestRated !== undefined && bestRated - r < SAME_QUALITY_BAND_POINTS) {
      preferred.push(pool);
    } else {
      demoted.push(pool);
    }
  }

  const byRateDesc = (a: T, b: T) => (rate(b) ?? 0) - (rate(a) ?? 0) || a.costUsdCents - b.costUsdCents;

  // 0: at or above typical and within the cap (nearest typical first); 1:
  // luxury, above the cap (least extreme first); 2: below typical (nearest
  // typical first, so the cheapest rung is always the very last of the
  // unrated).
  const band = (pool: T) =>
    pool.costUsdCents < typical ? 2 : pool.costUsdCents > typical * PREMIUM_CAP_MULTIPLE ? 1 : 0;
  const nearestTypicalFirst = (a: T, b: T) => {
    const ba = band(a);
    const bb = band(b);
    if (ba !== bb) return ba === 0 ? -1 : bb === 0 ? 1 : ba === 1 ? -1 : 1;
    // Below typical: nearest typical (dearest of them) first. At or above it,
    // within the cap or beyond: nearest typical (cheapest of them) first.
    if (ba === 2) return b.costUsdCents - a.costUsdCents || b.stockCount - a.stockCount;
    return a.costUsdCents - b.costUsdCents || b.stockCount - a.stockCount;
  };

  return [
    ...preferred.sort(byRateDesc),
    ...unratedDeep.sort(nearestTypicalFirst),
    ...unratedThin.sort(nearestTypicalFirst),
    ...demoted.sort(byRateDesc),
  ];
}

/**
 * One rung to attempt, with the figure it is priced from.
 * `providerOfferId` is absent for a pair GrizzlySMS has no seller breakdown
 * for (a single-price service such as Fiverr): that is bought untargeted.
 */
export interface LadderRung {
  providerOfferId?: string;
  costUsdCents: number;
  stockCount?: number;
}

/**
 * Pool quality to rank with: the pair's own record where it has one, else the
 * same pool's record across everything Xencodes has sold from it. A seller id
 * is global on GrizzlySMS, and a single pair rarely has the 8 settled orders
 * needed to rate a pool on its own, so without this fallback a bad seller
 * could keep being offered in every country it had not yet failed in.
 */
export function mergePoolQuality(
  pair: Map<string, QualityStat>,
  global: Map<string, QualityStat>,
): Map<string, QualityStat> {
  const merged = new Map(global);
  for (const [id, stat] of pair) merged.set(id, stat);
  return merged;
}

/**
 * How much more than the price a customer was shown they are charged,
 * without being asked again, when the rung they were quoted on sells out
 * before their purchase lands and the next rung up costs more. Above this a
 * new price is shown and confirmed instead (a "price_changed" result); below
 * it the sale just goes through, because losing a customer to a one-click
 * prompt over a small move is the more expensive mistake. A customer is never
 * charged more than the rung they actually receive costs.
 */
export const AUTO_ACCEPT_PRICE_INCREASE_PERCENT = 25;

export function autoAcceptCeilingKobo(agreedPriceKobo: number): number {
  return Math.floor(agreedPriceKobo * (1 + AUTO_ACCEPT_PRICE_INCREASE_PERCENT / 100));
}

/** Most supplier purchase calls one customer purchase may make. Each is a
 *  round trip, and a serverless request has a time limit. */
export const MAX_PURCHASE_ATTEMPTS = 8;

export interface PricedRung {
  providerOfferId?: string;
  customerPriceKobo: number;
}

/**
 * The rungs worth attempting now, in order: not already tried, priced within
 * what the customer will pay without being asked, and within what their
 * wallet holds.
 */
export function selectAttempts<T extends PricedRung>(
  ladder: T[],
  tried: ReadonlySet<string | undefined>,
  ceilingKobo: number,
  balanceKobo: number,
): T[] {
  return ladder.filter(
    (rung) =>
      !tried.has(rung.providerOfferId) &&
      rung.customerPriceKobo <= ceilingKobo &&
      rung.customerPriceKobo <= balanceKobo,
  );
}

/** The lowest price among rungs that are in stock but above `ceilingKobo`,
 *  which is what the customer should be shown to confirm. Null when there
 *  are none. */
export function cheapestAboveCeiling<T extends PricedRung>(
  ladder: T[],
  tried: ReadonlySet<string | undefined>,
  ceilingKobo: number,
): number | null {
  let lowest: number | null = null;
  for (const rung of ladder) {
    if (tried.has(rung.providerOfferId) || rung.customerPriceKobo <= ceilingKobo) continue;
    if (lowest === null || rung.customerPriceKobo < lowest) lowest = rung.customerPriceKobo;
  }
  return lowest;
}
