import { NextResponse } from "next/server";
import { verifyKorapayWebhookSignature, KorapayError } from "@/lib/korapay";
import { reconcileTopUp } from "@/lib/funding";

/**
 * KoraPay's webhook: told a reference changed status, then asked directly
 * what that status actually is before touching a balance.
 *
 * A webhook body is never trusted on its own, on two levels. First, the
 * signature: without a valid x-korapay-signature this request could be
 * anyone on the internet claiming a payment succeeded. Second, even a
 * correctly signed body's own claim about the outcome is only used to
 * decide which reference to ask KoraPay about; reconcileTopUp() makes its
 * own call back to KoraPay with this server's own secret key before
 * completeTopUp() ever runs, so a forged or stale event body cannot credit
 * a wallet by itself. Also logs the attempt to PaymentVerificationLog, so a
 * webhook that arrives but cannot settle (KoraPay's read API briefly down,
 * a mismatch) leaves a visible trail rather than only a server log line.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { event?: string; data?: { reference?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const signature = request.headers.get("x-korapay-signature");
  let signatureValid: boolean;
  try {
    signatureValid = verifyKorapayWebhookSignature(body.data, signature);
  } catch (error) {
    // KORAPAY_ENCRYPTION_KEY missing or otherwise unreadable on this
    // deployment: verifyKorapayWebhookSignature() throws rather than
    // silently treating every signature as invalid, specifically so this
    // never gets confused with an actual bad/forged signature (401) below.
    // Left uncaught, this crashed the whole route with a raw 500 for every
    // single webhook Korapay ever sent — meaning no top-up could ever be
    // credited automatically, not just this one. 500 (not 200) so Korapay
    // keeps retrying: once the missing configuration is fixed, the very
    // next retry succeeds through this same, unmodified path.
    console.error(
      "[korapay-webhook] misconfigured: could not check the webhook signature.",
      error instanceof KorapayError ? error.message : error,
    );
    return NextResponse.json({ error: "Webhook verification is misconfigured." }, { status: 500 });
  }
  if (!signatureValid) {
    console.error("[korapay-webhook] rejected: invalid or missing signature.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const reference = body.data?.reference;
  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  try {
    const outcome = await reconcileTopUp(reference, "WEBHOOK");
    return NextResponse.json({ received: true, outcome: outcome.state });
  } catch (error) {
    console.error(`[korapay-webhook] failed to settle ${reference}:`, error);
    // 200, not 500: KoraPay retries on non-2xx, and a bug on this end
    // should not cause the same webhook to hammer this endpoint forever.
    // The payment is still safely reconcilable later from the admin panel
    // or the customer's own return-from-checkout check.
    return NextResponse.json({ received: true, outcome: "error" });
  }
}
