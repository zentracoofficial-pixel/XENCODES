/**
 * Price multiplier helpers with no server imports, so the admin forms (which
 * run in the browser) can use them. src/lib/pricing.ts, which does the real
 * pricing and talks to the database, builds on the same numbers.
 *
 * A price is the provider's cost times a multiplier: at 3x the customer pays
 * three times what the supplier bills. The margin percent that goes with it
 * (profit as a share of the price) is derived from the multiplier for
 * display and for the order record; it is never an input.
 */

/** The multiplier range an admin may set: 1x is selling at cost, 100x is the
 *  most the cost ceiling in pricing.ts allows for. */
export const MIN_PRICE_MULTIPLIER = 1;
export const MAX_PRICE_MULTIPLIER = 100;

/** The margin percent (profit as a share of the price) a multiplier earns. */
export function multiplierToMarginPercent(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0;
  return Math.round((1 - 1 / multiplier) * 1000) / 10;
}

/** The multiplier a stored margin percent is equivalent to. */
export function marginPercentToMultiplier(percent: number): number {
  return 1 / (1 - percent / 100);
}

/** A multiplier as an admin reads it: "3x", "2.5x", "1.43x". */
export function formatMultiplier(multiplier: number): string {
  return `${Number(multiplier.toFixed(2))}x`;
}
