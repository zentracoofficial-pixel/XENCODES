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
  /** Which number provider adapter to use. See src/lib/provider/index.ts. */
  providerId: "provider_id",
  providerEnabled: "provider_enabled",
  /** Naira per one US dollar, used to convert a USD-priced provider like
   *  GrizzlySMS into the Naira prices this site charges in. */
  usdToNgnRate: "usd_to_ngn_rate",
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
