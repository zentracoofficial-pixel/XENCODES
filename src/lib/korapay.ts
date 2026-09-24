import { createHmac, timingSafeEqual } from "crypto";
import { SITE_URL } from "@/lib/site";

/**
 * KoraPay's Checkout Standard API: initialize a hosted checkout page,
 * verify a charge's status server side, and check a webhook's signature.
 *
 * Confirmed against KoraPay's published Node SDK source and cross-checked
 * against a second, independently written SDK, since this sandbox cannot
 * reach korapay.com or its docs directly to verify against a live
 * response. Two things worth a real test transaction before relying on
 * this in production, flagged here rather than guessed past:
 *
 * 1. `amount` is the base currency unit (Naira, not kobo) — confirmed by
 *    a doc comment in a second SDK giving bounds "NGN 100" to
 *    "NGN 10,000,000" for a numerically identical parameter, not just by
 *    one source.
 * 2. The webhook signature is documented as an HMAC-SHA256 of the
 *    "stringified data object" from the request body, which in every
 *    reference implementation found means: parse the JSON body, take its
 *    `data` property, and JSON.stringify that value again. This works in
 *    practice but is sensitive to key ordering in principle; it is the
 *    documented and universally implemented approach, not an assumption
 *    specific to this integration.
 *
 * `merchant_bears_cost: false` was tried here to have KoraPay add its own
 * fee automatically at checkout, but a real test top-up broke immediately
 * on KoraPay's hosted page ("issue verifying the payment information")
 * before a payment method could even be chosen, so it has been removed.
 * Whatever the actual cause (the field not being valid for this checkout
 * type, or a mismatch with this account's own KoraPay settings), do not
 * re-add it without confirming against KoraPay support or a real sandbox
 * response first, not just documentation summaries.
 */

const BASE_URL = "https://api.korapay.com/merchant/api/v1";

export function isKorapayConfigured(): boolean {
  return Boolean(process.env.KORAPAY_SECRET_KEY);
}

export class KorapayError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "network" | "rejected" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "KorapayError";
  }
}

function secretKey(): string {
  const key = process.env.KORAPAY_SECRET_KEY;
  if (!key) {
    throw new KorapayError(
      "KORAPAY_SECRET_KEY is not set as an environment variable on this deployment.",
      "not_configured",
    );
  }
  return key;
}

// Korapay signs webhook payloads with the Encryption Key, not the Secret Key.
function encryptionKey(): string {
  const key = process.env.KORAPAY_ENCRYPTION_KEY;
  if (!key) {
    throw new KorapayError(
      "KORAPAY_ENCRYPTION_KEY is not set as an environment variable on this deployment.",
      "not_configured",
    );
  }
  return key;
}

function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}

interface KorapayEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<KorapayEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (error) {
    throw new KorapayError(
      `KoraPay request failed: ${error instanceof Error ? error.message : "network error"}`,
      "network",
    );
  }

  let json: KorapayEnvelope<T> | undefined;
  try {
    json = (await response.json()) as KorapayEnvelope<T>;
  } catch {
    throw new KorapayError(
      `KoraPay returned a non-JSON response (HTTP ${response.status}) for ${path}.`,
      "unknown",
    );
  }

  if (!response.ok || !json.status) {
    // The one place KoraPay's own rejection reason (bad field, wrong
    // amount bounds, a channel not enabled on this account) is captured
    // in full. Never includes the request body, so the secret key and a
    // customer's email never end up in a log line.
    console.error(
      `[korapay] ${method} ${path} rejected (HTTP ${response.status}):`,
      JSON.stringify(json),
    );
    throw new KorapayError(
      json.message || `KoraPay rejected the request to ${path} (HTTP ${response.status}).`,
      "rejected",
    );
  }

  return json;
}

export interface InitializeChargeInput {
  reference: string;
  amountKobo: number;
  email: string;
  name?: string | null;
}

export interface InitializeChargeResult {
  checkoutUrl: string;
}

/**
 * Starts a hosted checkout: KoraPay returns a URL the customer's browser
 * is sent to, pays there, and is sent back to our own redirect_url. No
 * money moves here; this only asks KoraPay to open a page for it.
 */
export async function initializeKorapayCharge(
  input: InitializeChargeInput,
): Promise<InitializeChargeResult> {
  const result = await call<{ reference: string; checkout_url: string }>(
    "POST",
    "/charges/initialize",
    {
      reference: input.reference,
      amount: koboToNaira(input.amountKobo),
      currency: "NGN",
      customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
      narration: "Xencodes wallet top up",
      redirect_url: `${SITE_URL}/dashboard/wallet?reference=${input.reference}`,
      notification_url: `${SITE_URL}/api/webhooks/korapay`,
    },
  );

  return { checkoutUrl: result.data.checkout_url };
}

export type KorapayChargeStatus = "pending" | "processing" | "success" | "failed" | "expired";

export interface ChargeStatusResult {
  status: KorapayChargeStatus;
  providerTransactionId: string;
}

/**
 * The authoritative check: asks KoraPay directly, over a connection only
 * this server can make with its own secret key, what a charge's status
 * actually is. Used both as the webhook's own double-check and as the
 * customer's fast path back from the checkout redirect, so crediting a
 * wallet never depends on trusting a value a browser redirect could have
 * been made to carry.
 */
export async function verifyKorapayCharge(reference: string): Promise<ChargeStatusResult> {
  const result = await call<{ reference: string; status: string }>(
    "GET",
    `/charges/${encodeURIComponent(reference)}`,
  );

  const status = result.data.status as KorapayChargeStatus;
  return { status, providerTransactionId: result.data.reference };
}

/**
 * Verifies the `x-korapay-signature` header on an incoming webhook. Takes
 * the already-parsed `data` object (not the raw body) since that is what
 * the signature is computed over; the caller is responsible for parsing
 * the outer envelope first.
 *
 * Constant-time compare: a webhook endpoint is, by definition, reachable
 * by anyone on the internet, so comparing signatures the ordinary way
 * would leak timing information about the correct value.
 */
export function verifyKorapayWebhookSignature(
  data: unknown,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", encryptionKey())
    .update(JSON.stringify(data))
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signatureHeader, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
