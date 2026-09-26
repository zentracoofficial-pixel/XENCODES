import { prisma } from "@/lib/prisma";

/**
 * Platform settings: the handful of values an admin controls that are not
 * per-user and not per-order.
 *
 * Note what is not here. A supplier's API key is never stored in this
 * table, because a secret in the database is a secret the admin panel can
 * read back and a database backup can carry. Supplier credentials come
 * from environment variables and are read only inside src/lib/provider.
 * What lives here is the non-secret choice: which supplier, where, and
 * whether the connection is on.
 */

export const SETTING_KEYS = {
  /** Gross margin applied to a service with no rule of its own. */
  defaultGrossMarginPercent: "default_gross_margin_percent",
  /** Gross margin for services on the exclusive tier, such as Fiverr. */
  exclusiveGrossMarginPercent: "exclusive_gross_margin_percent",
  /** Legacy single-provider selection, from before multiple providers could
   *  be enabled at once. Read only as a one-time fallback when providerConfig
   *  below has never been written; see src/lib/provider/config.ts. */
  providerId: "provider_id",
  providerEnabled: "provider_enabled",
  /** JSON array of {id, enabled, priority} per provider, keyed by the
   *  provider's own registry id. See src/lib/provider/config.ts, the only
   *  reader/writer of this key. Not a secret: it never holds credentials,
   *  only which registered providers are switched on and in what order. */
  providerConfig: "provider_config_v2",
  /** Legacy single-currency rate, from before more than one currency could
   *  be enabled. Read only as a one-time fallback when currencyConfig below
   *  has never been written; see src/lib/currency-config.ts. */
  usdToNgnRate: "usd_to_ngn_rate",
  /** Percentage of a wallet top-up passed on to the customer as KoraPay's
   *  own processing fee, so it is not silently absorbed by the business.
   *  A percentage rather than a fixed amount, so this one setting applies
   *  across every enabled currency; the cap it is bounded by is per
   *  currency (see src/lib/currency-config.ts) since a fixed cap in one
   *  currency's minor units means nothing in another's. See
   *  src/lib/funding-limits.ts's calculateTopupFeeKobo(). */
  topupFeePercent: "topup_fee_percent",
  /** Legacy single-currency fee cap, from before more than one currency
   *  could be enabled. Read only as a one-time fallback for NGN's own cap
   *  when currencyConfig has never been written. */
  topupFeeCapKobo: "topup_fee_cap_kobo",
  /** JSON object keyed by the two fixed currency codes, {NGN: {usdRate,
   *  minTopUpMinor, maxTopUpMinor, feeCapMinor}, USD: {...}}. Xencodes only
   *  ever sells in NGN or USD, never a currency per country; see
   *  src/lib/currency-config.ts, the only reader/writer of this key.
   *  Versioned _v2 because the shape changed from an earlier array format;
   *  the old key is abandoned, not migrated, since every value it could
   *  hold is recoverable from the legacy usd_to_ngn_rate/topup_fee_cap_kobo
   *  fallback below. */
  currencyConfig: "currency_config_v2",
  /** Wallet balance, in NGN kobo, at or below which the dashboard shows a
   *  low-balance warning. Deliberately its own simple numeric setting
   *  rather than folded into currency_config_v2: it is a UX nudge, not a
   *  funding/pricing bound, and each currency needs its own figure since
   *  NGN and USD amounts are on wildly different scales. */
  lowBalanceThresholdNgnKobo: "low_balance_threshold_ngn_kobo",
  /** Same, in USD cents. */
  lowBalanceThresholdUsdCents: "low_balance_threshold_usd_cents",
} as const;

/** A clearly-labelled placeholder, not a live rate. An admin must set the
 *  real one in Settings before going live with a USD-priced provider. */
export const DEFAULT_USD_TO_NGN_RATE = 1600;

/**
 * Xencodes' standard gross margin, as a percentage of the customer price.
 *
 * Gross margin, not markup. At 50% the customer pays twice the supplier
 * cost; a 50% markup would be 1.5 times the cost and only a 33% margin.
 * See src/lib/pricing.ts, which is the only place this is applied.
 */
export const DEFAULT_GROSS_MARGIN_PERCENT = 50;

/** The exclusive tier: a deliberately thinner margin on a few services we
 *  want to be the cheapest place to buy. */
export const EXCLUSIVE_GROSS_MARGIN_PERCENT = 30;

/**
 * KoraPay's own published local rate for Nigeria: 1.5% per transaction,
 * capped at NGN 2,000, across card, bank transfer, USSD and mobile money.
 * Used as the out-of-the-box default so a top-up fee is passed on
 * correctly without an admin having to look this up or guess a number.
 * Kept editable in Settings for the rare case KoraPay quotes this specific
 * account a different negotiated rate.
 */
export const DEFAULT_TOPUP_FEE_PERCENT = 1.5;
export const DEFAULT_TOPUP_FEE_CAP_KOBO = 200_000; // NGN 2,000

/** Sane starting points, editable in Settings: low enough that a customer
 *  who could still afford one more number is not warned, high enough that
 *  the warning arrives before the wallet actually hits zero. */
export const DEFAULT_LOW_BALANCE_THRESHOLD_NGN_KOBO = 50_000; // NGN 500
export const DEFAULT_LOW_BALANCE_THRESHOLD_USD_CENTS = 200; // $2.00

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export async function readSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function writeSetting(key: SettingKey, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export function readNumber(
  settings: Record<string, string>,
  key: SettingKey,
  fallback = 0,
) {
  const parsed = Number(settings[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}
