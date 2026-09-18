import { NextResponse } from "next/server";
import { verifyKorapayWebhookSignature } from "@/lib/korapay";
import { verifyAndSettleTopUp } from "@/lib/funding";

/**
 * KoraPay's webhook: told a reference changed status, then asked directly
 * what that status actually is before touching a balance.
 *
 * A webhook body is never trusted on its own, on two levels. First, the
 * signature: without a valid x-korapay-signature this request could be
 * anyone on the internet claiming a payment succeeded. Second, even a
 * correctly signed body's own claim about the outcome is only used to
 * decide which reference to ask KoraPay about; verifyAndSettleTopUp()
 * makes its own call back to KoraPay with this server's own secret key
 * before completeTopUp() ever runs, so a forged or stale event body
 * cannot credit a wallet by itself.
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
  if (!verifyKorapayWebhookSignature(body.data, signature)) {
    console.error("[korapay-webhook] rejected: invalid or missing signature.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const reference = body.data?.reference;
  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  try {
    const outcome = await verifyAndSettleTopUp(reference);
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
