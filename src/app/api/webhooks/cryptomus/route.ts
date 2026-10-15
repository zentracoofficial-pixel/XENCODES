import { NextResponse } from "next/server";
import { verifyCryptomusWebhook, CryptomusError, CRYPTOMUS_WEBHOOK_IP } from "@/lib/cryptomus";
import { reconcileTopUp } from "@/lib/funding";

/**
 * Cryptomus's payment webhook: told an invoice changed, then asks Cryptomus
 * directly what its status is before touching a balance.
 *
 * Trusted on neither level by itself: the body must carry a valid `sign`
 * (made with our payment API key), and even then its claimed status is only
 * used to decide which invoice to look up; reconcileTopUp() calls Cryptomus's
 * /payment/info with our own key before completeTopUp() can run. Our order id
 * is Cryptomus's `order_id`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let valid: boolean;
  try {
    valid = verifyCryptomusWebhook(body);
  } catch (error) {
    // Not configured on this deployment: 500 so Cryptomus retries once the
    // keys are set, rather than treating its webhook as forged.
    console.error("[cryptomus-webhook] misconfigured:", error instanceof CryptomusError ? error.message : error);
    return NextResponse.json({ error: "Webhook verification is misconfigured." }, { status: 500 });
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!valid) {
    console.error(
      `[cryptomus-webhook] rejected: invalid signature. ${JSON.stringify({
        type: typeof body.type === "string" ? body.type.slice(0, 20) : null,
        orderId: typeof body.order_id === "string" ? body.order_id.slice(0, 60) : null,
        ip,
      })}`,
    );
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  if (ip && ip !== CRYPTOMUS_WEBHOOK_IP) {
    console.warn(`[cryptomus-webhook] signed webhook from unexpected IP ${ip}; checking with Cryptomus anyway.`);
  }

  if (body.type !== "payment") return NextResponse.json({ received: true, ignored: "not a payment webhook" });
  const reference = body.order_id;
  if (typeof reference !== "string" || !reference.startsWith("xen_")) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  try {
    const outcome = await reconcileTopUp(reference, "WEBHOOK");
    return NextResponse.json({ received: true, outcome: outcome.state });
  } catch (error) {
    console.error(`[cryptomus-webhook] failed to settle ${reference}:`, error);
    // 200 so a bug here does not make Cryptomus retry forever; the payment is
    // still settled by the customer's return, the wallet page and the sweep.
    return NextResponse.json({ received: true, outcome: "error" });
  }
}
