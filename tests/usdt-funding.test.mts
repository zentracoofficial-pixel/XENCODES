import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/**
 * USDT funding through Cryptomus, against the real database and settlement
 * code, with Cryptomus stubbed at the network edge (global fetch).
 */

process.env.CRYPTOMUS_MERCHANT_ID = "merchant-uuid-test";
process.env.CRYPTOMUS_PAYMENT_API_KEY = "payment-key-test";

const { prisma } = await import("../src/lib/prisma");
const { cryptomusSign, createUsdtInvoice, verifyCryptomusWebhook, usdStringToCents } = await import("../src/lib/cryptomus");
const { createPendingUsdtTopUp, verifyAndSettleTopUp } = await import("../src/lib/funding");
const { POST: webhook } = await import("../src/app/api/webhooks/cryptomus/route");

const KEY = "payment-key-test";
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
/** Signs a body the way Cryptomus (PHP json_encode) does: "/" written as "\/". */
function phpSign(body: Record<string, unknown>) {
  const json = JSON.stringify(body).replace(/\//g, "\\/");
  return md5(Buffer.from(json).toString("base64") + KEY);
}

const realFetch = globalThis.fetch;
let info: Record<string, unknown> = {};
const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
const userIds: string[] = [];

before(() => {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.cryptomus.com/v1/")) {
      calls.push({ url, headers: init?.headers as Record<string, string>, body: String(init?.body ?? "") });
      const parsed = JSON.parse(String(init?.body ?? "{}"));
      const result = url.endsWith("/payment")
        ? { uuid: "inv-uuid", order_id: parsed.order_id, amount: parsed.amount, currency: "USD", url: "https://pay.cryptomus.com/pay/inv-uuid", status: "check", is_final: false }
        : { uuid: "inv-uuid", order_id: parsed.order_id, currency: "USD", url: "https://pay.cryptomus.com/pay/inv-uuid", is_final: true, ...info };
      return new Response(JSON.stringify({ state: 0, result }), { status: 200 });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  await prisma.paymentVerificationLog.deleteMany({ where: { walletTransaction: { userId: { in: userIds } } } }).catch(() => {});
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

async function usdUser(balance = 0) {
  const user = await prisma.user.create({
    data: { email: `usdt-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`, passwordHash: "x", currency: "USD", walletBalanceKobo: balance },
  });
  userIds.push(user.id);
  return user;
}
const balance = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).walletBalanceKobo;

test("dollar strings become cents exactly", () => {
  assert.equal(usdStringToCents("20.00"), 2000);
  assert.equal(usdStringToCents("0.1"), 10);
  assert.equal(usdStringToCents("12.345"), 1235);
  assert.equal(usdStringToCents("-5"), null);
  assert.equal(usdStringToCents("abc"), null);
});

test("an invoice is a signed USD invoice payable in USDT", async () => {
  calls.length = 0;
  const invoice = await createUsdtInvoice({ reference: "xen_test_ref", amountCents: 2000 });
  assert.equal(invoice.url, "https://pay.cryptomus.com/pay/inv-uuid");
  const call = calls[0];
  assert.equal(call.url, "https://api.cryptomus.com/v1/payment");
  assert.equal(call.headers.merchant, "merchant-uuid-test");
  assert.equal(call.headers.sign, cryptomusSign(call.body, KEY));
  const body = JSON.parse(call.body);
  assert.equal(body.amount, "20.00");
  assert.equal(body.currency, "USD");
  assert.equal(body.to_currency, "USDT");
  assert.equal(body.order_id, "xen_test_ref");
  assert.match(body.url_callback, /\/api\/webhooks\/cryptomus$/);
});

test("webhook signatures are checked, including PHP's escaped slashes", () => {
  const body: Record<string, unknown> = { type: "payment", uuid: "u", order_id: "xen_a", amount: "20.00", status: "paid", url: "https://x.test/a/b" };
  assert.equal(verifyCryptomusWebhook({ ...body, sign: phpSign(body) }), true);
  const plainSign = md5(Buffer.from(JSON.stringify(body)).toString("base64") + KEY);
  assert.equal(verifyCryptomusWebhook({ ...body, sign: plainSign }), true);
  assert.equal(verifyCryptomusWebhook({ ...body, amount: "2000.00", sign: phpSign(body) }), false);
  assert.equal(verifyCryptomusWebhook({ ...body, sign: "nope" }), false);
  assert.equal(verifyCryptomusWebhook(body), false);
});

test("a paid invoice credits exactly the dollars asked for, once", async () => {
  const user = await usdUser(500);
  const row = await createPendingUsdtTopUp(user.id, 2000, 0);
  assert.equal(row.currency, "USD");
  assert.equal(row.paymentCurrency, "USDT");
  info = { status: "paid", amount: "20.00", payer_currency: "USDT", network: "tron" };
  assert.deepEqual(await verifyAndSettleTopUp(row.providerReference!), { state: "credited" });
  assert.equal(await balance(user.id), 2500);
  assert.deepEqual(await verifyAndSettleTopUp(row.providerReference!), { state: "credited" });
  assert.equal(await balance(user.id), 2500);
  const settled = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(settled.status, "SUCCESSFUL");
  assert.equal(settled.providerTransactionId, "inv-uuid");
  assert.equal(settled.paymentMethod, "USDT tron");
});

test("an invoice for a different amount is never credited", async () => {
  const user = await usdUser();
  const row = await createPendingUsdtTopUp(user.id, 2000, 0);
  info = { status: "paid", amount: "200.00" };
  assert.equal((await verifyAndSettleTopUp(row.providerReference!)).state, "still_pending");
  assert.equal(await balance(user.id), 0);
});

test("unpaid, failed and underpaid invoices settle without crediting", async () => {
  const user = await usdUser();
  const cancelled = await createPendingUsdtTopUp(user.id, 1000, 0);
  info = { status: "cancel", amount: "10.00" };
  assert.equal((await verifyAndSettleTopUp(cancelled.providerReference!)).state, "failed");
  assert.equal((await prisma.walletTransaction.findUniqueOrThrow({ where: { id: cancelled.id } })).status, "CANCELLED");

  const failed = await createPendingUsdtTopUp(user.id, 1000, 0);
  info = { status: "fail", amount: "10.00" };
  assert.equal((await verifyAndSettleTopUp(failed.providerReference!)).state, "failed");
  assert.equal((await prisma.walletTransaction.findUniqueOrThrow({ where: { id: failed.id } })).status, "FAILED");

  const under = await createPendingUsdtTopUp(user.id, 1000, 0);
  info = { status: "wrong_amount", amount: "10.00" };
  assert.equal((await verifyAndSettleTopUp(under.providerReference!)).state, "still_pending");
  assert.equal((await prisma.walletTransaction.findUniqueOrThrow({ where: { id: under.id } })).status, "PENDING");

  const waiting = await createPendingUsdtTopUp(user.id, 1000, 0);
  info = { status: "check", amount: "10.00" };
  assert.equal((await verifyAndSettleTopUp(waiting.providerReference!)).state, "still_pending");
  assert.equal(await balance(user.id), 0);
});

test("the webhook route rejects unsigned requests and settles signed ones", async () => {
  const user = await usdUser();
  const row = await createPendingUsdtTopUp(user.id, 1500, 0);
  const body: Record<string, unknown> = { type: "payment", uuid: "inv-uuid", order_id: row.providerReference, amount: "15.00", status: "paid" };
  const request = (b: unknown) =>
    new Request("http://localhost/api/webhooks/cryptomus", { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } });

  const forged = await webhook(request({ ...body, sign: "0".repeat(32) }));
  assert.equal(forged.status, 401);
  assert.equal(await balance(user.id), 0);

  info = { status: "paid", amount: "15.00" };
  const real = await webhook(request({ ...body, sign: phpSign(body) }));
  assert.equal(real.status, 200);
  assert.equal(await balance(user.id), 1500);
});
