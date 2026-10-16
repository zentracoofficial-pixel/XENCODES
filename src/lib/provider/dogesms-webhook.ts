import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { DOGESMS_PROVIDER_ID } from "./dogesms";

/**
 * DogeSMS's webhooks: how its orders report a number and a code.
 *
 * Every request is signed: `X-Webhook-Signature: sha256=<hex>`, an
 * HMAC-SHA256 of the raw body with the webhook secret from the DogeSMS
 * dashboard (DOGESMS_WEBHOOK_SECRET). Anything unsigned or wrongly signed is
 * refused before its body is read for meaning.
 */

export function verifyDogeSmsSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const given = header.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

const RANK: Record<string, number> = { pending: 0, active: 1, completed: 2, expired: 2, cancelled: 2, failed: 2 };

const EVENT_STATUS: Record<string, string> = {
  "order.created": "pending",
  "order.number_allocated": "active",
  "order.completed": "completed",
  "order.failed": "failed",
  "order.expired": "expired",
  "order.cancelled": "cancelled",
  "order.canceled": "cancelled",
};

export interface DogeSmsEvent {
  eventType: string;
  orderId: string;
  status: string;
  phoneNumber: string | null;
  code: string | null;
  text: string | null;
  errorCode: string | null;
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** The parts of a webhook body that matter, or null when it is not an order event. */
export function parseDogeSmsEvent(body: unknown): DogeSmsEvent | null {
  if (!body || typeof body !== "object") return null;
  const outer = body as Record<string, unknown>;
  const data = (outer.data && typeof outer.data === "object" ? outer.data : outer) as Record<string, unknown>;
  const eventType = s(outer.event_type) ?? s(outer.event) ?? s(outer.type) ?? s(data.event_type) ?? "";
  const orderId = s(data.order_id) ?? s(data.id);
  if (!orderId) return null;
  const status = (EVENT_STATUS[eventType] ?? s(data.status) ?? "").toLowerCase().replace("canceled", "cancelled");
  if (!(status in RANK)) return null;
  return {
    eventType: eventType || `status.${status}`,
    orderId,
    status,
    phoneNumber: s(data.phone_number),
    code: s(data.sms_code),
    text: s(data.sms_content),
    errorCode: s(data.error_code),
  };
}

/**
 * Stores an event against its order, never moving the order backwards: a
 * late "number allocated" after "completed" changes nothing, and a code once
 * stored is kept. Returns whether anything changed.
 */
export async function recordDogeSmsEvent(event: DogeSmsEvent): Promise<boolean> {
  const where = { providerId_providerOrderId: { providerId: DOGESMS_PROVIDER_ID, providerOrderId: event.orderId } };
  const existing = await prisma.providerOrderState.findUnique({ where });
  if (!existing) {
    await prisma.providerOrderState
      .create({
        data: {
          providerId: DOGESMS_PROVIDER_ID,
          providerOrderId: event.orderId,
          status: event.status,
          phoneNumber: event.phoneNumber,
          code: event.code,
          text: event.text,
          errorCode: event.errorCode,
          lastEventType: event.eventType,
        },
      })
      .catch(async () => {
        // Created by a concurrent delivery a moment ago: apply on top of it.
        await recordDogeSmsEvent(event);
      });
    return true;
  }
  const forward = (RANK[event.status] ?? 0) > (RANK[existing.status] ?? 0);
  const sameStage = event.status === existing.status;
  await prisma.providerOrderState.update({
    where,
    data: {
      ...(forward ? { status: event.status } : {}),
      phoneNumber: existing.phoneNumber ?? event.phoneNumber,
      code: existing.code ?? (forward || sameStage ? event.code : null),
      text: existing.text ?? (forward || sameStage ? event.text : null),
      errorCode: existing.errorCode ?? event.errorCode,
      lastEventType: event.eventType,
      eventCount: { increment: 1 },
    },
  });
  return forward || (!existing.code && Boolean(event.code)) || (!existing.phoneNumber && Boolean(event.phoneNumber));
}
