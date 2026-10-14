import { readSettings, updateSettingAtomically, SETTING_KEYS } from "@/lib/settings";
import { calculateTopupFeeKobo } from "@/lib/funding-limits";
import type { FundingCurrencyCode } from "@/lib/funding-currencies";

/**
 * Admin-approved fees: the one place a fee on a customer's payment comes
 * from.
 *
 * Nothing here has a default. A fee is shown to a customer or added to a
 * payment only when a policy for that exact payment type and currency
 * exists, an admin has APPROVED it, and it is ENABLED. The backend resolves
 * the fee from this table when it quotes a payment and again when it opens
 * the checkout, and the browser only ever displays what the server returned,
 * so the fee a customer sees is the fee that is charged, and nothing in the
 * browser can add, remove or change one.
 *
 * Three outcomes for a payment type + currency:
 *  - approved and enabled: the fee applies;
 *  - approved but not enabled: the admin has decided there is no fee, so the
 *    payment goes ahead with none and no fee is shown;
 *  - missing or not approved (a draft): the admin has not made the decision
 *    yet, so the payment is refused rather than guessing at a fee.
 *
 * Today the only fee type Xencodes has is the processing fee passed on at
 * wallet funding. Number prices are prices, not fees, and there are no
 * withdrawals or other service charges. New fee types plug in here by adding
 * a kind.
 */

export type FeeKind = "wallet_funding";
export type FeeCurrency = "NGN" | FundingCurrencyCode;

export interface FeePolicy {
  kind: FeeKind;
  currency: FeeCurrency;
  model: "percent" | "fixed";
  /** Percent of the amount, for the percent model. */
  percent: number;
  /** Flat fee in the currency's minor unit, for the fixed model. */
  fixedMinor: number;
  /** Largest fee in the currency's minor unit for the percent model; null
   *  means no cap. */
  capMinor: number | null;
  approved: boolean;
  enabled: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
}

export function feePolicyKey(kind: FeeKind, currency: FeeCurrency): string {
  return `${kind}:${currency}`;
}

function sanitize(value: unknown, kind: FeeKind, currency: FeeCurrency): FeePolicy | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const model = v.model === "fixed" ? "fixed" : v.model === "percent" ? "percent" : null;
  if (!model) return null;
  const percent = typeof v.percent === "number" && v.percent >= 0 && v.percent <= 50 ? v.percent : 0;
  const fixedMinor =
    typeof v.fixedMinor === "number" && Number.isInteger(v.fixedMinor) && v.fixedMinor >= 0 ? v.fixedMinor : 0;
  const capMinor =
    typeof v.capMinor === "number" && Number.isInteger(v.capMinor) && v.capMinor >= 0 ? v.capMinor : null;
  return {
    kind,
    currency,
    model,
    percent,
    fixedMinor,
    capMinor,
    approved: v.approved === true,
    enabled: v.enabled === true,
    approvedBy: typeof v.approvedBy === "string" ? v.approvedBy : null,
    approvedAt: typeof v.approvedAt === "string" ? v.approvedAt : null,
  };
}

function parseRaw(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    console.error(`[fees] "${SETTING_KEYS.feePolicies}" is not valid JSON; treating every fee as unconfigured.`);
    return {};
  }
}

async function readRaw(preloaded?: Record<string, string>): Promise<Record<string, unknown>> {
  const settings = preloaded ?? (await readSettings());
  return parseRaw(settings[SETTING_KEYS.feePolicies]);
}

export async function readFeePolicy(
  kind: FeeKind,
  currency: FeeCurrency,
  preloaded?: Record<string, string>,
): Promise<FeePolicy | null> {
  const raw = await readRaw(preloaded);
  return sanitize(raw[feePolicyKey(kind, currency)], kind, currency);
}

/** Every wallet-funding fee policy from one settings read, by currency. */
export function readFeePolicyMap(settings: Record<string, string>): Map<string, FeePolicy> {
  const raw = parseRaw(settings[SETTING_KEYS.feePolicies]);
  const map = new Map<string, FeePolicy>();
  for (const key of Object.keys(raw)) {
    const [kind, currency] = key.split(":");
    if (kind !== "wallet_funding" || !currency) continue;
    const policy = sanitize(raw[key], "wallet_funding", currency as FeeCurrency);
    if (policy) map.set(currency, policy);
  }
  return map;
}

/** The fee for an amount under a policy, in minor units. Pure. The percent
 *  model rounds up (a fee rounded down would undercharge what the provider
 *  takes), then applies the cap. */
export function computeFee(policy: FeePolicy, amountMinor: number): number {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  if (policy.model === "fixed") return policy.fixedMinor;
  return calculateTopupFeeKobo(amountMinor, policy.percent, policy.capMinor ?? Number.MAX_SAFE_INTEGER);
}

export type FeeResolution =
  /** An approved, enabled fee applies. */
  | { status: "applied"; feeMinor: number; policy: FeePolicy }
  /** Approved, but the admin has it switched off: no fee, none shown. */
  | { status: "none"; feeMinor: 0 }
  /** No approved policy exists: the payment must not proceed. */
  | { status: "blocked"; feeMinor: 0; reason: "missing" | "unapproved" };

/** Pure resolution of a policy (or its absence) for an amount. */
export function resolveFee(policy: FeePolicy | null, amountMinor: number): FeeResolution {
  if (!policy) return { status: "blocked", feeMinor: 0, reason: "missing" };
  if (!policy.approved) return { status: "blocked", feeMinor: 0, reason: "unapproved" };
  if (!policy.enabled) return { status: "none", feeMinor: 0 };
  return { status: "applied", feeMinor: computeFee(policy, amountMinor), policy };
}

export async function resolveFundingFee(currency: FeeCurrency, amountMinor: number): Promise<FeeResolution> {
  return resolveFee(await readFeePolicy("wallet_funding", currency), amountMinor);
}

/** Whether payments in this currency may proceed as far as fees go. */
export async function isFundingFeeConfigured(currency: FeeCurrency): Promise<boolean> {
  return (await resolveFundingFee(currency, 1)).status !== "blocked";
}

export interface FeePolicyPatch {
  model: "percent" | "fixed";
  percent: number;
  fixedMinor: number;
  capMinor: number | null;
  approved: boolean;
  enabled: boolean;
}

export type FeePolicyError = "percent_invalid" | "fixed_invalid" | "cap_invalid" | "enable_needs_approval";

/** Validates and stores a policy. Enabling needs approval, and approving
 *  records who and when. */
export async function saveFeePolicy(
  kind: FeeKind,
  currency: FeeCurrency,
  patch: FeePolicyPatch,
  admin: { email: string },
): Promise<{ ok: true; before: FeePolicy | null; after: FeePolicy } | { ok: false; error: FeePolicyError }> {
  if (patch.model === "percent" && !(patch.percent >= 0 && patch.percent <= 50)) {
    return { ok: false, error: "percent_invalid" };
  }
  if (patch.model === "fixed" && !(Number.isInteger(patch.fixedMinor) && patch.fixedMinor >= 0)) {
    return { ok: false, error: "fixed_invalid" };
  }
  if (patch.capMinor !== null && !(Number.isInteger(patch.capMinor) && patch.capMinor >= 0)) {
    return { ok: false, error: "cap_invalid" };
  }
  if (patch.enabled && !patch.approved) return { ok: false, error: "enable_needs_approval" };

  const key = feePolicyKey(kind, currency);
  let before: FeePolicy | null = null;
  let after: FeePolicy | null = null;
  // Compare-and-swap, so saving one currency's fee never undoes another
  // admin's change to a different one made at the same moment.
  await updateSettingAtomically(SETTING_KEYS.feePolicies, (current) => {
    const raw = parseRaw(current);
    before = sanitize(raw[key], kind, currency);
    const newlyApproved = patch.approved && !(before?.approved ?? false);
    after = {
      kind,
      currency,
      model: patch.model,
      percent: patch.model === "percent" ? patch.percent : 0,
      fixedMinor: patch.model === "fixed" ? patch.fixedMinor : 0,
      capMinor: patch.model === "percent" ? patch.capMinor : null,
      approved: patch.approved,
      enabled: patch.enabled,
      approvedBy: patch.approved ? (newlyApproved || !before?.approvedBy ? admin.email : before.approvedBy) : null,
      approvedAt: patch.approved
        ? newlyApproved || !before?.approvedAt
          ? new Date().toISOString()
          : before.approvedAt
        : null,
    };
    raw[key] = after;
    return JSON.stringify(raw);
  });
  if (!after) throw new Error("Fee policy was not saved.");
  return { ok: true, before, after: after as FeePolicy };
}

/** A customer-facing description of an applied fee, for the funding summary. */
export function describeFee(policy: FeePolicy): string {
  return policy.model === "fixed" ? "Flat fee" : `${policy.percent}% processing fee`;
}
