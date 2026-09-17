/**
 * Funding limits and amount validation, with no server imports.
 *
 * Kept separate from funding.ts so the browser can render and pre-validate
 * the amount field without dragging the database client and Node crypto
 * into the client bundle. The server still re-validates with the same
 * function: this is a convenience for the customer, never the check that
 * matters.
 */

/** The currency the wallet is denominated in, and the one a payment will
 *  be charged in. Naira, matching the kobo amounts stored everywhere. */
export const WALLET_CURRENCY = "NGN";

/**
 * The intended payment provider.
 *
 * `id` is what gets written to a funding row's provider column, so it is
 * recorded from the moment a request is created rather than backfilled
 * later. Naming it here does not connect it: nothing in the codebase talks
 * to this provider yet, and a wallet is credited only by completeTopUp()
 * after a payment has been verified on the server.
 */
export const FUNDING_PROVIDER = { id: "korapay", label: "KoraPay" } as const;

/** Bounds on a single funding attempt, in kobo. Low enough to top up for
 *  one number, high enough to be useful, and deliberately a range rather
 *  than a set of packages: the amount is the customer's choice. */
export const MIN_TOPUP_KOBO = 100_000; // 1,000 Naira
export const MAX_TOPUP_KOBO = 50_000_000; // 500,000 Naira

export type FundingError =
  | "not_authenticated"
  | "amount_too_low"
  | "amount_too_high"
  | "amount_invalid";

function nairaWords(kobo: number) {
  return `NGN ${(kobo / 100).toLocaleString("en-NG")}`;
}

export const FUNDING_ERROR_COPY: Record<FundingError, string> = {
  not_authenticated: "Log in to add funds.",
  amount_invalid: "Enter a valid amount.",
  amount_too_low: `The smallest top up is ${nairaWords(MIN_TOPUP_KOBO)}.`,
  amount_too_high: `The largest single top up is ${nairaWords(MAX_TOPUP_KOBO)}.`,
};

export function validateTopUpAmount(amountKobo: number): FundingError | null {
  if (!Number.isFinite(amountKobo) || !Number.isInteger(amountKobo) || amountKobo <= 0) {
    return "amount_invalid";
  }
  if (amountKobo < MIN_TOPUP_KOBO) return "amount_too_low";
  if (amountKobo > MAX_TOPUP_KOBO) return "amount_too_high";
  return null;
}
