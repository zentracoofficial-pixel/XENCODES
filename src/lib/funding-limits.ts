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
export const MIN_TOPUP_KOBO = 10_000; // 100 Naira
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

/**
 * KoraPay's own processing fee, passed on to the customer rather than
 * absorbed by the business. The wallet is still only ever credited the
 * amount the customer actually asked for (see completeTopUp() in
 * funding.ts, which credits WalletTransaction.amountKobo unchanged); this
 * fee is added on top of what KoraPay is asked to charge at checkout,
 * never subtracted from what lands in the balance.
 *
 * Modelled as percent-with-a-cap because that is how KoraPay's own
 * published rate actually works (1.5% capped at NGN 2,000, see
 * DEFAULT_TOPUP_FEE_PERCENT/DEFAULT_TOPUP_FEE_CAP_KOBO in settings.ts), not
 * because this codebase invented that shape. There is no supported way to
 * have KoraPay itself add its real fee at checkout for the hosted
 * Checkout Redirect product this integration uses (its documented request
 * fields are amount/currency/reference/customer/redirect_url/
 * notification_url/channels/narration only — no fee-bearer field; that
 * field exists only on KoraPay's separate direct bank-transfer and
 * mobile-money charge APIs, and sending it here broke the checkout page
 * in a real production test), so this is the one place that fee can
 * reliably be applied without risking checkout itself.
 *
 * Rounds up, matching quotePrice()'s own rounding direction in pricing.ts:
 * a fee rounded down would occasionally undercharge for what KoraPay
 * actually takes, and consistently rounding the same direction everywhere
 * is what keeps that from happening.
 */
export function calculateTopupFeeKobo(
  amountKobo: number,
  feePercent: number,
  feeCapKobo: number,
): number {
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) return 0;
  const percentPortion = Math.ceil((amountKobo * feePercent) / 100);
  return Math.max(0, Math.min(percentPortion, feeCapKobo));
}
