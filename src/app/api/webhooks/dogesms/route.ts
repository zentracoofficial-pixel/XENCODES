import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DOGESMS_PROVIDER_ID } from "@/lib/provider/dogesms";
import { verifyDogeSmsSignature, parseDogeSmsEvent, recordDogeSmsEvent } from "@/lib/provider/dogesms-webhook";
import { reconcileActivation } from "@/lib/activation-lifecycle";

/**
 * DogeSMS order webhooks (Server II). Signed with DOGESMS_WEBHOOK_SECRET.
 * The event is stored first (so a purchase waiting for its number, and the
 * customer's own polling, can read it), then the matching order is settled
 * at once through the same reconcileActivation() every other path uses.
 * Answers say nothing about what was found, to anyone.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.DOGESMS_WEBHOOK_SECRET ?? "";
  const raw = await request.text();
  if (!secret) {
    console.error("[dogesms-webhook] DOGESMS_WEBHOOK_SECRET is not set; refusing.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (!verifyDogeSmsSignature(raw, request.headers.get("x-webhook-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const event = parseDogeSmsEvent(body);
  if (!event) return NextResponse.json({ received: true });

  try {
    await recordDogeSmsEvent(event);
    const activation = await prisma.activation.findFirst({
      where: { provider: DOGESMS_PROVIDER_ID, providerOrderId: event.orderId, status: "WAITING" },
      select: { id: true },
    });
    if (activation) await reconcileActivation(activation.id, "PROVIDER_WEBHOOK");
  } catch (error) {
    console.error(`[dogesms-webhook] failed to apply ${event.eventType} for order ${event.orderId}:`, error);
    // 500 so DogeSMS delivers it again.
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
