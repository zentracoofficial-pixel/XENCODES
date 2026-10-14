import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Local-currency funding against the real database and the real settlement
 * code, with KoraPay itself stubbed at the network edge (global fetch), so
 * what is exercised is our own eligibility, quoting, verification and
 * crediting, not a copy of it.
 */

process.env.KORAPAY_SECRET_KEY = "sk_test_stub";
process.env.KORAPAY_ENCRYPTION_KEY = "enc_test_stub";

const { prisma } = await import("../src/lib/prisma");
const { quoteLocalFunding, saveFundingState, readFundingStates, getFundingOptions } = await import(
  "../src/lib/funding-config"
);
const { createPendingLocalTopUp, createPendingTopUp, reconcileTopUp, verifyAndSettleTopUp } = await import(
  "../src/lib/funding"
);
const { SETTING_KEYS } = await import("../src/lib/settings");

type Charge = { status: string; amount?: number | string; currency?: string; payment_method?: string };
let charge: Charge = { status: "pending" };
let verifyCalls = 0;
const realFetch = globalThis.fetch;

let userId = "";
let savedSetting: string | null = null;

before(async () => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/charges/") && !url.includes("initialize")) {
      verifyCalls++;
      const reference = decodeURIComponent(url.split("/charges/")[1]);
      return new Response(JSON.stringify({ status: true, message: "ok", data: { reference, ...charge } }), {
        status: 200,
      });
    }
    return realFetch(input as RequestInfo);
  }) as typeof fetch;

  savedSetting = (await prisma.setting.findUnique({ where: { key: SETTING_KEYS.fundingCurrencies } }))?.value ?? null;
  await prisma.setting.deleteMany({ where: { key: SETTING_KEYS.fundingCurrencies } });

  const user = await prisma.user.create({
    data: {
      email: `local-funding-${Date.now()}@test.invalid`,
      passwordHash: "x",
      currency: "NGN",
      country: "GH",
    },
  });
  userId = user.id;
});

after(async () => {
  globalThis.fetch = realFetch;
  await prisma.paymentVerificationLog.deleteMany({ where: { walletTransaction: { userId } } });
  await prisma.walletTransaction.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.setting.deleteMany({ where: { key: SETTING_KEYS.fundingCurrencies } });
  if (savedSetting !== null) {
    await prisma.setting.create({ data: { key: SETTING_KEYS.fundingCurrencies, value: savedSetting } });
  }
  await prisma.$disconnect();
});

async function balance() {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).walletBalanceKobo;
}

async function enable(code: "GHS" | "KES" | "XAF" = "GHS", usdRate = 15) {
  const r = await saveFundingState(code, {
    enabled: true,
    usdRate,
    feePercent: 1.5,
    minMinor: code === "XAF" ? 500 : 1000,
    maxMinor: code === "XAF" ? 1_000_000 : 1_000_000,
  });
  assert.equal(r.ok, true);
}

test("everything is off by default: no options, every quote refused", async () => {
  const states = await readFundingStates();
  for (const s of Object.values(states)) assert.equal(s.enabled, false);
  assert.deepEqual(await getFundingOptions("GH"), []);
  const q = await quoteLocalFunding({ savedCountry: "GH", currency: "GHS", amountMinor: 10_000 });
  assert.deepEqual(q.ok, false);
  assert.equal(!q.ok && q.error, "currency_unavailable");
});

test("a currency cannot be enabled without a rate", async () => {
  const r = await saveFundingState("KES", { enabled: true, usdRate: 0, feePercent: 1.5, minMinor: 1000, maxMinor: 5000 });
  assert.deepEqual(r, { ok: false, error: "rate_required" });
});

test("enabled currency is offered to its own country only", async () => {
  await enable("GHS");
  assert.deepEqual((await getFundingOptions("GH")).map((o) => o.code), ["GHS"]);
  assert.deepEqual(await getFundingOptions("KE"), []);
  assert.deepEqual(await getFundingOptions("NG"), []);
  // unknown country: every enabled option is a candidate; the server still holds the pick to a country
  assert.deepEqual((await getFundingOptions(null)).map((o) => o.code), ["GHS"]);
});

test("server rejects unsupported currencies, mismatched countries and bad amounts", async () => {
  const bad = async (input: Parameters<typeof quoteLocalFunding>[0]) => {
    const r = await quoteLocalFunding(input);
    return r.ok ? "ok" : r.error;
  };
  assert.equal(await bad({ savedCountry: "GH", currency: "USD", amountMinor: 10_000 }), "unsupported_currency");
  assert.equal(await bad({ savedCountry: "GH", currency: "EUR", amountMinor: 10_000 }), "unsupported_currency");
  assert.equal(await bad({ savedCountry: "GH", currency: "NGN", amountMinor: 10_000 }), "unsupported_currency");
  assert.equal(await bad({ savedCountry: "GH", currency: "KES", amountMinor: 10_000 }), "currency_unavailable");
  assert.equal(await bad({ savedCountry: "KE", currency: "GHS", amountMinor: 10_000 }), "unsupported_country");
  assert.equal(await bad({ savedCountry: "NG", currency: "GHS", amountMinor: 10_000 }), "unsupported_country");
  assert.equal(await bad({ savedCountry: null, currency: "GHS", amountMinor: 10_000 }), "country_required");
  assert.equal(await bad({ savedCountry: "GH", currency: "GHS", amountMinor: 100 }), "amount_too_low");
  assert.equal(await bad({ savedCountry: "GH", currency: "GHS", amountMinor: 99_999_999 }), "amount_too_high");
  assert.equal(await bad({ savedCountry: "GH", currency: "GHS", amountMinor: 1234.5 }), "amount_invalid");
  assert.equal(await bad({ savedCountry: "GH", currency: "GHS", amountMinor: Number.NaN }), "amount_invalid");
  // a saved country wins over whatever the browser claims
  assert.equal(await bad({ savedCountry: "KE", claimedCountry: "GH", currency: "GHS", amountMinor: 10_000 }), "unsupported_country");
  // with no saved country, the picked one is used
  assert.equal(await bad({ savedCountry: null, claimedCountry: "GH", currency: "GHS", amountMinor: 10_000 }), "ok");
});

async function pendingGhs(amountMinor = 10_000) {
  const quoted = await quoteLocalFunding({ savedCountry: "GH", currency: "GHS", amountMinor });
  assert.ok(quoted.ok);
  return { row: await createPendingLocalTopUp(userId, quoted.quote), quote: quoted.quote };
}

test("pending record stores provider-facing and wallet-facing amounts separately and credits nothing", async () => {
  const before = await balance();
  const { row, quote } = await pendingGhs(10_000);
  assert.equal(row.status, "PENDING");
  assert.equal(row.currency, "NGN");
  assert.equal(row.amountKobo, quote.creditKobo);
  assert.equal(row.paymentCurrency, "GHS");
  assert.equal(row.paymentAmountMinor, quote.totalMinor);
  assert.equal(row.paymentFeeMinor, quote.feeMinor);
  assert.ok(row.fxRate && row.fxRate > 0);
  assert.ok(row.providerReference?.startsWith("xen_"));
  assert.equal(await balance(), before);
});

test("a payment in the wrong currency, with the wrong amount, or with no amount is never credited", async () => {
  const { row, quote } = await pendingGhs(20_000);
  const ref = row.providerReference!;
  const before = await balance();

  charge = { status: "success", amount: quote.totalMinor / 100, currency: "NGN" };
  assert.deepEqual(await verifyAndSettleTopUp(ref), { state: "still_pending", reason: "currency_mismatch" });

  charge = { status: "success", amount: 1, currency: "GHS" };
  assert.deepEqual(await verifyAndSettleTopUp(ref), { state: "still_pending", reason: "amount_mismatch" });

  charge = { status: "success", currency: "GHS" };
  assert.deepEqual(await verifyAndSettleTopUp(ref), { state: "still_pending", reason: "amount_mismatch" });

  charge = { status: "success", amount: "abc", currency: "GHS" };
  assert.deepEqual(await verifyAndSettleTopUp(ref), { state: "still_pending", reason: "amount_mismatch" });

  assert.equal(await balance(), before);
  assert.equal((await prisma.walletTransaction.findUniqueOrThrow({ where: { id: row.id } })).status, "PENDING");
});

test("a pending payment (redirect only, nothing paid) credits nothing", async () => {
  const { row } = await pendingGhs(10_000);
  const before = await balance();
  charge = { status: "pending" };
  assert.deepEqual(await verifyAndSettleTopUp(row.providerReference!), { state: "still_pending" });
  assert.equal(await balance(), before);
});

test("a verified payment credits the Naira wallet exactly once, even when settled concurrently", async () => {
  const { row, quote } = await pendingGhs(10_000);
  const ref = row.providerReference!;
  const before = await balance();

  // KoraPay reports the amount as a string, the way it may in practice.
  charge = { status: "success", amount: String(quote.totalMinor / 100), currency: "GHS", payment_method: "mobile_money" };
  const results = await Promise.all([
    reconcileTopUp(ref, "WEBHOOK"),
    reconcileTopUp(ref, "RETURN_REDIRECT"),
    reconcileTopUp(ref, "WEBHOOK"),
    reconcileTopUp(ref, "ADMIN_MANUAL", { id: "a", email: "a@test.invalid" }),
  ]);
  assert.ok(results.every((r) => r.state === "credited"));
  assert.equal(await balance(), before + quote.creditKobo);

  // Replays later do nothing.
  await reconcileTopUp(ref, "WEBHOOK");
  await verifyAndSettleTopUp(ref);
  assert.equal(await balance(), before + quote.creditKobo);

  const saved = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(saved.status, "SUCCESSFUL");
  assert.equal(saved.paymentMethod, "mobile_money");
  assert.equal(saved.providerTransactionId, ref);
  assert.equal(saved.paymentCurrency, "GHS");
});

test("the exchange rate is fixed when the request is made: a later rate change does not alter the credit", async () => {
  const { row, quote } = await pendingGhs(10_000);
  await enable("GHS", 5); // GHS suddenly "worth" far more NGN per unit
  const before = await balance();
  charge = { status: "success", amount: quote.totalMinor / 100, currency: "GHS" };
  await reconcileTopUp(row.providerReference!, "WEBHOOK");
  assert.equal(await balance(), before + quote.creditKobo);
  await enable("GHS", 15);
});

test("a declined local payment is recorded as failed and credits nothing", async () => {
  const { row } = await pendingGhs(10_000);
  const before = await balance();
  charge = { status: "failed" };
  assert.deepEqual(await verifyAndSettleTopUp(row.providerReference!), { state: "failed" });
  assert.equal((await prisma.walletTransaction.findUniqueOrThrow({ where: { id: row.id } })).status, "FAILED");
  assert.equal(await balance(), before);
});

test("Naira funding is unaffected: still verified and credited as before, with a string amount tolerated", async () => {
  const before = await balance();
  const row = await createPendingTopUp(userId, 500_000, "NGN", 10_000, 100_000_000);
  assert.equal(row.paymentCurrency, null);
  charge = { status: "success", amount: "5000", currency: "NGN" };
  const outcome = await verifyAndSettleTopUp(row.providerReference!);
  assert.equal(outcome.state, "credited");
  assert.equal(await balance(), before + 500_000);
  // and a Naira row is still refused when KoraPay reports a different currency
  const other = await createPendingTopUp(userId, 500_000, "NGN", 10_000, 100_000_000);
  charge = { status: "success", amount: 5000, currency: "GHS" };
  assert.deepEqual(await verifyAndSettleTopUp(other.providerReference!), {
    state: "still_pending",
    reason: "currency_mismatch",
  });
});

test("XAF/XOF payments are charged in whole multiples of 5", async () => {
  await enable("XAF", 600);
  const r = await quoteLocalFunding({ savedCountry: "CM", currency: "XAF", amountMinor: 10_003 });
  assert.ok(r.ok);
  assert.equal(r.quote.totalMinor % 5, 0);
  assert.ok(verifyCalls > 0);
});
