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

/** Which way an admin typed a price rule: as a multiple of cost ("x") or as a
 *  margin percent ("%"). Both mean the same thing; 3x is 66.7%. */
export type PriceUnit = "x" | "%";

export type ParsedPrice = { multiplier: number } | { error: string };

/**
 * Turns what an admin typed, in either unit, into the multiplier that is
 * stored and used for pricing. A percent becomes the multiple it is
 * equivalent to (60% is 2.5x, 80% is 5x, 95% is 20x), kept to two decimals.
 */
export function parsePriceInput(raw: string, unit: PriceUnit): ParsedPrice {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value)) return { error: "Enter a number." };

  if (unit === "%") {
    if (value < 0 || value > 99) return { error: "A margin percent must be between 0 and 99." };
    return { multiplier: Math.round(marginPercentToMultiplier(value) * 100) / 100 };
  }

  if (value < MIN_PRICE_MULTIPLIER || value > MAX_PRICE_MULTIPLIER) {
    return { error: `A multiple must be between ${MIN_PRICE_MULTIPLIER} and ${MAX_PRICE_MULTIPLIER}, for example 3.` };
  }
  return { multiplier: Math.round(value * 100) / 100 };
}

/** What a price change looks like on a few sample provider costs. */
export interface PricePreview {
  currency: string;
  /** The multiple in force now and the one that would apply, "x". */
  beforeMultiplier: number;
  afterMultiplier: number;
  rows: { costKobo: number; beforeKobo: number; afterKobo: number }[];
}

export type PricePreviewResult = { preview: PricePreview } | { error: string };
