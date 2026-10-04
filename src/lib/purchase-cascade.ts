import type { PriceQuote } from "@/lib/pricing";
import type { PurchasedNumber } from "@/lib/provider/types";
import {
  MAX_PURCHASE_ATTEMPTS,
  cheapestAboveCeiling,
  selectAttempts,
} from "@/lib/pool-ladder";

/**
 * Buys one number by walking a pair's price ladder (see pool-ladder.ts).
 *
 * The supplier sells one pair from many sellers at many prices and the
 * cheapest rung often holds a few dozen numbers. When a rung is empty the
 * supplier answers NO_NUMBERS although thousands remain one rung up, so an
 * empty rung means "try the next", never "out of stock". The pair is only
 * given up on once every rung within what the customer will pay has been
 * tried, a fresh quote has been tried once more, and one last unrestricted
 * request has been made.
 *
 * I/O-free apart from the two callbacks, so the whole sequence is testable
 * against a fake supplier.
 */

export interface CascadeRung {
  providerOfferId?: string;
  costUsdCents: number;
  quote: PriceQuote;
}

export interface CascadeQuote {
  provider: string;
  ladder: CascadeRung[];
}

export interface CascadeSuccess<Q extends CascadeQuote> {
  assigned: PurchasedNumber;
  /** The quote the winning rung belongs to (may be a fresher one than the
   *  quote the purchase started from). */
  quoted: Q;
  /** What the customer is billed: the rung that actually served the order. */
  quote: PriceQuote;
  /** The seller that served it; absent when none could be named. */
  providerOfferId?: string;
}

export interface CascadeResult<Q extends CascadeQuote> {
  success?: CascadeSuccess<Q>;
  /** Set when nothing was bought but dearer rungs still have numbers: the
   *  lowest of their prices, to be shown to the customer to confirm. */
  dearerPriceKobo: number | null;
  /** The newest quote looked at. */
  quoted: Q;
  attempts: number;
}

export async function runPurchaseCascade<Q extends CascadeQuote>(opts: {
  initial: Q;
  ceilingKobo: number;
  balanceKobo: number;
  /** A fresh quote, or null when the pair can no longer be quoted. */
  requote: () => Promise<Q | null>;
  /** One supplier purchase call. Resolves null when that rung is out of
   *  stock; any other failure must throw. */
  attempt: (
    quoted: Q,
    rung: { providerOfferId?: string; costUsdCents: number },
  ) => Promise<PurchasedNumber | null>;
  /** Stop starting new supplier calls once this returns true. */
  outOfTime?: () => boolean;
}): Promise<CascadeResult<Q>> {
  const { ceilingKobo, balanceKobo, requote, attempt } = opts;
  const outOfTime = opts.outOfTime ?? (() => false);
  let quoted = opts.initial;
  const firstPrimary = quoted.ladder[0];
  let tried = new Set<string | undefined>();
  let attempts = 0;
  const canGo = () => attempts < MAX_PURCHASE_ATTEMPTS && !outOfTime();
  const priced = (q: Q) => q.ladder.map((rung) => ({ ...rung, customerPriceKobo: rung.quote.customerPriceKobo }));

  const call = async (q: Q, rung: { providerOfferId?: string; costUsdCents: number }) => {
    attempts += 1;
    return attempt(q, rung);
  };

  for (let round = 0; round < 2; round++) {
    if (round === 1) {
      // Everything quoted is spent. The ladder moves as other buyers on the
      // supplier's platform take numbers, so look once more, fresh, before
      // calling the pair sold out.
      if (!canGo()) break;
      const fresh = await requote();
      if (!fresh) break;
      if (fresh.provider !== quoted.provider) tried = new Set();
      quoted = fresh;
    }

    for (const rung of selectAttempts(priced(quoted), tried, ceilingKobo, balanceKobo)) {
      if (!canGo()) break;
      tried.add(rung.providerOfferId);
      const assigned = await call(quoted, rung);
      if (assigned) {
        return {
          success: { assigned, quoted, quote: rung.quote, providerOfferId: rung.providerOfferId },
          dearerPriceKobo: null,
          quoted,
          attempts,
        };
      }
    }
  }

  // Last resort, only when the supplier broke the pair down into sellers (so
  // every attempt above named one): ask for anything at all at or below the
  // price first quoted. Whatever it sells costs no more than that rung, so
  // billing the first quote's price can only be at or above the margin that
  // was promised. The seller is unknown, so none is recorded.
  if (
    firstPrimary?.providerOfferId !== undefined &&
    firstPrimary.quote.customerPriceKobo <= ceilingKobo &&
    firstPrimary.quote.customerPriceKobo <= balanceKobo &&
    canGo()
  ) {
    const first = opts.initial;
    const assigned = await call(first, { costUsdCents: firstPrimary.costUsdCents });
    if (assigned) {
      return {
        success: { assigned, quoted: first, quote: firstPrimary.quote },
        dearerPriceKobo: null,
        quoted: first,
        attempts,
      };
    }
  }

  return {
    dearerPriceKobo: cheapestAboveCeiling(priced(quoted), tried, ceilingKobo),
    quoted,
    attempts,
  };
}
