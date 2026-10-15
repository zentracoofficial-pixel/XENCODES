import { createHash, timingSafeEqual } from "crypto";
import { SITE_URL } from "@/lib/site";

/**
 * Cryptomus: USDT wallet funding.
 *
 * A customer asks to add, say, $20. We open a Cryptomus invoice for 20 USD
 * that must be paid in USDT (the customer picks the network on Cryptomus's
 * own page) and send them there. Cryptomus then tells our webhook the invoice
 * changed, and, exactly like KoraPay, that message is only a prompt: the
 * wallet is credited after we ask Cryptomus ourselves (a signed /payment/info
 * call) and it says the invoice is paid, for exactly the amount we asked.
 *
 * Configured only through two environment variables, set on Vercel, never in
 * code: CRYPTOMUS_MERCHANT_ID (the merchant's UUID) and
 * CRYPTOMUS_PAYMENT_API_KEY (the merchant's *Payment* API key, not the Payout
 * or User key). Without both, USDT funding stays "coming soon".
 */

const BASE_URL = "https://api.cryptomus.com/v1";
const TIMEOUT_MS = 15_000;

export const CRYPTOMUS_PROVIDER = { id: "cryptomus", label: "Cryptomus" } as const;

/** Where Cryptomus says its webhooks come from. Logged when a request comes
 *  from elsewhere; the signature (and our own follow-up check) is what is
 *  actually relied on. */
export const CRYPTOMUS_WEBHOOK_IP = "91.227.144.54";

export class CryptomusError extends Error {}

function config(): { merchantId: string; apiKey: string } | null {
  const merchantId = process.env.CRYPTOMUS_MERCHANT_ID?.trim();
  const apiKey = process.env.CRYPTOMUS_PAYMENT_API_KEY?.trim();
  return merchantId && apiKey ? { merchantId, apiKey } : null;
}

export function isCryptomusConfigured(): boolean {
  return config() !== null;
}

/** md5(base64(json) + payment API key), as Cryptomus signs and checks. */
export function cryptomusSign(json: string, apiKey: string): string {
  return createHash("md5").update(Buffer.from(json).toString("base64") + apiKey).digest("hex");
}

async function call<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const cfg = config();
  if (!cfg) throw new CryptomusError("Cryptomus is not configured.");
  const body = JSON.stringify(payload);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", merchant: cfg.merchantId, sign: cryptomusSign(body, cfg.apiKey) },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new CryptomusError(`Cryptomus could not be reached: ${error instanceof Error ? error.message : "request failed"}`);
  }
  let data: { state?: number; result?: T; message?: string; errors?: Record<string, string[]> };
  try {
    data = await response.json();
  } catch {
    throw new CryptomusError(`Cryptomus answered HTTP ${response.status} with no readable body.`);
  }
  if (!response.ok || data.state !== 0 || !data.result) {
    const detail = data.errors
      ? Object.entries(data.errors)
          .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
          .join("; ")
      : (data.message ?? `HTTP ${response.status}`);
    throw new CryptomusError(`Cryptomus rejected ${path}: ${detail}`);
  }
  return data.result;
}

interface RawPayment {
  uuid: string;
  order_id: string;
  amount: string;
  currency: string;
  payer_amount?: string | null;
  payer_currency?: string | null;
  payment_amount?: string | null;
  merchant_amount?: string | null;
  network?: string | null;
  txid?: string | null;
  url: string;
  status?: string;
  payment_status?: string;
  is_final: boolean;
}

export interface CryptomusPayment {
  uuid: string;
  orderId: string;
  /** Invoice amount in its own currency's minor unit (USD cents). */
  amountMinor: number | null;
  currency: string;
  status: string;
  isFinal: boolean;
  url: string;
  payerCurrency: string | null;
  network: string | null;
  txid: string | null;
}

/** "12.50" -> 1250. Null for anything that is not a plain positive amount. */
export function usdStringToCents(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

function normalize(raw: RawPayment): CryptomusPayment {
  return {
    uuid: raw.uuid,
    orderId: raw.order_id,
    amountMinor: usdStringToCents(raw.amount),
    currency: raw.currency,
    status: raw.status ?? raw.payment_status ?? "unknown",
    isFinal: raw.is_final === true,
    url: raw.url,
    payerCurrency: raw.payer_currency ?? null,
    network: raw.network ?? null,
    txid: raw.txid ?? null,
  };
}

/**
 * Opens an invoice for `amountCents` US dollars, payable in USDT, and returns
 * where to send the customer. `reference` is our own id for the attempt and
 * comes back on every webhook and lookup.
 */
export async function createUsdtInvoice(input: { reference: string; amountCents: number }): Promise<CryptomusPayment> {
  const raw = await call<RawPayment>("/payment", {
    amount: (input.amountCents / 100).toFixed(2),
    currency: "USD",
    order_id: input.reference,
    to_currency: "USDT",
    url_callback: `${SITE_URL}/api/webhooks/cryptomus`,
    url_return: `${SITE_URL}/dashboard/wallet?reference=${input.reference}`,
    url_success: `${SITE_URL}/dashboard/wallet?reference=${input.reference}`,
    // One hour to pay; Cryptomus then marks an unpaid invoice "cancel".
    lifetime: 3600,
  });
  return normalize(raw);
}

/** Cryptomus's own current answer for one of our invoices. */
export async function getCryptomusPayment(reference: string): Promise<CryptomusPayment> {
  return normalize(await call<RawPayment>("/payment/info", { order_id: reference }));
}

/**
 * Checks a webhook body's `sign`: md5(base64(json without sign) + key).
 * Cryptomus builds that JSON in PHP, which writes "/" as "\/", so both the
 * escaped and plain forms are tried. Never the only safeguard: a payment is
 * still confirmed with getCryptomusPayment() before any credit.
 */
export function verifyCryptomusWebhook(body: Record<string, unknown>): boolean {
  const cfg = config();
  if (!cfg) throw new CryptomusError("Cryptomus is not configured.");
  const sign = body.sign;
  if (typeof sign !== "string" || !/^[a-f0-9]{32}$/i.test(sign)) return false;
  const rest = { ...body };
  delete rest.sign;
  const plain = JSON.stringify(rest);
  const candidates = [plain.replace(/\//g, "\\/"), plain];
  const given = Buffer.from(sign.toLowerCase());
  return candidates.some((json) => {
    const expected = Buffer.from(cryptomusSign(json, cfg.apiKey));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
