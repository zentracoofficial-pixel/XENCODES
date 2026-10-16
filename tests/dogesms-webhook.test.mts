import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

/**
 * DogeSMS webhooks against the real database and settlement code: only a
 * correctly signed event is read, an order's state only moves forward, a
 * code settles the customer's order, and an expiry refunds it exactly once.
 */

process.env.DOGESMS_API_KEY = "sk_live_webhook_test";
process.env.DOGESMS_WEBHOOK_SECRET = "whsec_test";

const { prisma } = await import("../src/lib/prisma");
const { POST } = await import("../src/app/api/webhooks/dogesms/route");
const { verifyDogeSmsSignature, parseDogeSmsEvent } = await import("../src/lib/provider/dogesms-webhook");
const { DogeSmsProvider } = await import("../src/lib/provider/dogesms");

const realFetch = globalThis.fetch;
const userIds: string[] = [];
const orderIds: string[] = [];

before(() => {
  DogeSmsProvider.resetForTests();
  // Status queries are off on DogeSMS: every status call is refused, so the
  // adapter can only know what the webhook stored.
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    if (String(input).startsWith("https://api.dogesms.com/")) return new Response(JSON.stringify({ error: { code: "DISABLED" } }), { status: 403 });
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.activation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.providerOrderState.deleteMany({ where: { providerOrderId: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

const sign = (raw: string) => `sha256=${createHmac("sha256", "whsec_test").update(raw).digest("hex")}`;
function hook(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  return POST(new Request("http://localhost/api/webhooks/dogesms", { method: "POST", body: raw, headers: { "x-webhook-signature": signature ?? sign(raw) } }));
}

async function order(orderId: string) {
  orderIds.push(orderId);
  const user = await prisma.user.create({
    data: { email: `doge-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`, passwordHash: "x", currency: "NGN", walletBalanceKobo: 0 },
  });
  userIds.push(user.id);
  const activation = await prisma.activation.create({
    data: {
      userId: user.id,
      serviceSlug: "whatsapp",
      serviceName: "WhatsApp",
      countrySlug: "kenya",
      countryName: "Kenya",
      phoneNumber: "254700000001",
      provider: "dogesms",
      providerOrderId: orderId,
      priceKobo: 150000,
      chargeCurrency: "NGN",
      chargeMinor: 150000,
      expiresAt: new Date(Date.now() + 20 * 60_000),
    },
  });
  return { user, activation };
}

test("signatures: only the right secret over the exact body passes", () => {
  const raw = '{"event_type":"order.completed"}';
  assert.equal(verifyDogeSmsSignature(raw, sign(raw), "whsec_test"), true);
  assert.equal(verifyDogeSmsSignature(raw + " ", sign(raw), "whsec_test"), false);
  assert.equal(verifyDogeSmsSignature(raw, sign(raw), "other"), false);
  assert.equal(verifyDogeSmsSignature(raw, null, "whsec_test"), false);
  assert.equal(verifyDogeSmsSignature(raw, "sha256=zz", "whsec_test"), false);
});

test("events parse from the documented payloads; anything else is ignored", () => {
  assert.deepEqual(
    parseDogeSmsEvent({ event_type: "order.completed", order_id: "o1", phone_number: "1", sms_code: "123456", sms_content: "Your code 123456" }),
    { eventType: "order.completed", orderId: "o1", status: "completed", phoneNumber: "1", code: "123456", text: "Your code 123456", errorCode: null },
  );
  assert.equal(parseDogeSmsEvent({ event_type: "order.failed", order_id: "o2", error_code: "NO_NUMBERS_AVAILABLE" })?.status, "failed");
  assert.equal(parseDogeSmsEvent({ event_type: "balance.low" }), null);
});

test("an unsigned or forged webhook is refused and changes nothing", async () => {
  const { activation } = await order(`ord_forged_${Date.now()}`);
  const res = await hook({ event_type: "order.completed", order_id: activation.providerOrderId, sms_code: "999999" }, "sha256=" + "0".repeat(64));
  assert.equal(res.status, 401);
  const after = await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } });
  assert.equal(after.status, "WAITING");
});

test("a code arrives: the order is settled with it at once, and repeats or late events change nothing", async () => {
  const id = `ord_code_${Date.now()}`;
  const { activation } = await order(id);
  assert.equal((await hook({ event_type: "order.number_allocated", order_id: id, phone_number: "254700000001", status: "active" })).status, 200);
  assert.equal((await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } })).status, "WAITING");

  assert.equal((await hook({ event_type: "order.completed", order_id: id, sms_code: "482913", sms_content: "WhatsApp code 482-913" })).status, 200);
  const settled = await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } });
  assert.equal(settled.status, "RECEIVED");
  assert.equal(settled.code, "482913");

  await hook({ event_type: "order.completed", order_id: id, sms_code: "000000" });
  await hook({ event_type: "order.number_allocated", order_id: id, phone_number: "254700000009" });
  const state = await prisma.providerOrderState.findUniqueOrThrow({ where: { providerId_providerOrderId: { providerId: "dogesms", providerOrderId: id } } });
  assert.equal(state.status, "completed");
  assert.equal(state.code, "482913");
  assert.equal(state.phoneNumber, "254700000001");
  assert.equal((await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } })).code, "482913");
});

test("no SMS before the countdown ends: refunded to the customer exactly once", async () => {
  const id = `ord_exp_${Date.now()}`;
  const { user, activation } = await order(id);
  await hook({ event_type: "order.expired", order_id: id });
  await hook({ event_type: "order.expired", order_id: id });
  const after = await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } });
  assert.notEqual(after.status, "WAITING");
  assert.notEqual(after.status, "RECEIVED");
  const wallet = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(wallet.walletBalanceKobo, 150000);
  const refunds = await prisma.walletTransaction.count({ where: { userId: user.id, type: "REFUND" } });
  assert.equal(refunds, 1);
});
