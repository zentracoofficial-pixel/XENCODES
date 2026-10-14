import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Wallets held in the customer's own currency, against the real database:
 * a balance only changes when money moves, never when exchange rates do.
 */

process.env.KORAPAY_SECRET_KEY = "sk_test_stub";
process.env.KORAPAY_ENCRYPTION_KEY = "enc_test_stub";

const { prisma } = await import("../src/lib/prisma");
const { convertMinor, convertMoneyMinor } = await import("../src/lib/display-currency");
const { getDisplayRates } = await import("../src/lib/exchange-rates");
const { alignWalletCurrency, creditBalanceInTx, chargeOf, correctUnderpaidMoves, WALLET_CONVERSIONS_PER_DAY } = await import(
  "../src/lib/wallet-currency"
);
const { creditWallet } = await import("../src/lib/wallet");
const { createPendingTopUp, verifyAndSettleTopUp } = await import("../src/lib/funding");
const { SETTING_KEYS } = await import("../src/lib/settings");
const { parseRateTable, assembleRates } = await import("../src/lib/exchange-rates");

const realFetch = globalThis.fetch;
let charge: { status: string; amount?: number; currency?: string } = { status: "pending" };
let savedRates: string | null = null;
const userIds: string[] = [];

// Market rates: ₦50,000 = GH₵438.56.
const MARKET = { NGN: 1338.47, GHS: 11.74, KES: 129.63, XAF: 586.05, XOF: 586.05, EGP: 52.8, TZS: 2633.76 };

async function setRates(over: Record<string, number> = {}) {
  const rates = { ...MARKET, ...over };
  const value = JSON.stringify({ fetchedAt: new Date().toISOString(), attemptedAt: new Date().toISOString(), rates });
  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.displayRates },
    create: { key: SETTING_KEYS.displayRates, value },
    update: { value },
  });
}

async function newUser(currency: string, walletBalanceKobo = 0) {
  const user = await prisma.user.create({
    data: {
      email: `wallet-currency-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
      passwordHash: "x",
      currency,
      walletBalanceKobo,
      country: "GH",
    },
  });
  userIds.push(user.id);
  return user;
}

const balanceOf = async (id: string) =>
  prisma.user.findUniqueOrThrow({ where: { id }, select: { currency: true, walletBalanceKobo: true } });

before(async () => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/charges/")) {
      const reference = decodeURIComponent(url.split("/charges/")[1]);
      return new Response(JSON.stringify({ status: true, message: "ok", data: { reference, ...charge } }), { status: 200 });
    }
    return realFetch(input as RequestInfo);
  }) as typeof fetch;
  savedRates = (await prisma.setting.findUnique({ where: { key: SETTING_KEYS.displayRates } }))?.value ?? null;
  await setRates();
});

after(async () => {
  globalThis.fetch = realFetch;
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (savedRates === null) await prisma.setting.deleteMany({ where: { key: SETTING_KEYS.displayRates } });
  else await prisma.setting.update({ where: { key: SETTING_KEYS.displayRates }, data: { value: savedRates } });
  await prisma.$disconnect();
});

test("convertMinor converts through USD, and the same currency is returned unchanged", () => {
  const rates = { perUsd: { NGN: 1500, USD: 1, GHS: 12 }, asOf: null, stale: false };
  assert.equal(convertMinor(150_000, "NGN", "GHS", rates), 1_200); // ₦1,500 = $1 = GH₵12
  assert.equal(convertMinor(1_200, "GHS", "NGN", rates), 150_000);
  assert.equal(convertMinor(150_000, "NGN", "USD", rates), 100);
  assert.equal(convertMinor(12_345, "GHS", "GHS", rates), 12_345);
  assert.equal(convertMinor(100, "NGN", "KES", rates), null); // no KES rate
});

test("a balance stays exactly the same when exchange rates move", async () => {
  const user = await newUser("GHS", 10_000);
  await setRates({ GHS: 20 });
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: 10_000 });
  await setRates();
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: 10_000 });
});

test("an empty wallet simply switches to the chosen currency", async () => {
  const user = await newUser("NGN");
  const result = await alignWalletCurrency(user, "GHS", { convertBalance: false });
  assert.deepEqual(result, { ok: true, currency: "GHS", changed: true });
  assert.equal((await balanceOf(user.id)).currency, "GHS");
});

test("money in a wallet is not converted unless the customer chose the currency", async () => {
  const user = await newUser("NGN", 500_000);
  const result = await alignWalletCurrency(user, "GHS", { convertBalance: false });
  assert.deepEqual(result, { ok: true, currency: "NGN", changed: false });
  assert.deepEqual(await balanceOf(user.id), { currency: "NGN", walletBalanceKobo: 500_000 });
});

test("a chosen currency moves the balance once, with ledger rows that add up in each currency", async () => {
  const user = await newUser("NGN", 500_000);
  const rates = await getDisplayRates();
  const expected = convertMinor(500_000, "NGN", "GHS", rates);
  assert.ok(expected && expected > 0);
  const result = await alignWalletCurrency(user, "GHS", { convertBalance: true, rates });
  assert.deepEqual(result, { ok: true, currency: "GHS", changed: true });
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: expected });

  const rows = await prisma.walletTransaction.groupBy({
    by: ["currency"],
    where: { userId: user.id },
    _sum: { amountKobo: true },
  });
  const sums = Object.fromEntries(rows.map((r) => [r.currency, r._sum.amountKobo]));
  assert.equal(sums.NGN, -500_000);
  assert.equal(sums.GHS, expected);
});

test("balance moves are limited per day", async () => {
  const user = await newUser("NGN", 300_000);
  const codes = ["GHS", "KES", "GHS", "KES", "GHS"] as const;
  for (const code of codes.slice(0, WALLET_CONVERSIONS_PER_DAY)) {
    const r = await alignWalletCurrency(user, code, { convertBalance: true });
    assert.equal(r.ok, true, code);
  }
  const blocked = await alignWalletCurrency(user, "NGN", { convertBalance: true });
  assert.deepEqual(blocked, { ok: false, currency: "GHS", error: "too_many_changes" });
});

test("a refund in another currency is converted into the wallet's currency", async () => {
  const user = await newUser("GHS", 0);
  const rates = await getDisplayRates();
  await creditWallet(user.id, 150_000, "REFUND", "Refund test", "NGN");
  const expected = convertMinor(150_000, "NGN", "GHS", rates);
  const after = await balanceOf(user.id);
  assert.deepEqual(after, { currency: "GHS", walletBalanceKobo: expected });
  const row = await prisma.walletTransaction.findFirstOrThrow({ where: { userId: user.id, type: "REFUND" } });
  assert.equal(row.currency, "GHS");
  assert.equal(row.amountKobo, expected);
});

test("a refund in the wallet's own currency returns exactly what was charged", async () => {
  const user = await newUser("GHS", 0);
  const charged = chargeOf({ priceKobo: 250_000, currency: "NGN", chargeMinor: 2_037, chargeCurrency: "GHS" });
  await creditWallet(user.id, charged.amountMinor, "REFUND", "Refund test", charged.currency);
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: 2_037 });
  // Orders from before carry no charge record: their price in their own currency.
  assert.deepEqual(chargeOf({ priceKobo: 250_000, currency: "NGN", chargeMinor: null, chargeCurrency: null }), {
    amountMinor: 250_000,
    currency: "NGN",
  });
});

test("a credit is never applied in the wrong unit when the wallet's currency is guarded", async () => {
  const user = await newUser("KES", 1_000);
  const applied = await prisma.$transaction((tx) => creditBalanceInTx(tx, user.id, 500, "KES"));
  assert.deepEqual(applied, { amountMinor: 500, currency: "KES", converted: false });
  assert.equal((await balanceOf(user.id)).walletBalanceKobo, 1_500);
});

test("a Naira payment into a cedi wallet credits exactly the cedi amount fixed when it started", async () => {
  const user = await newUser("GHS", 0);
  const row = await createPendingTopUp(user.id, 500_000, "NGN", 10_000, 50_000_000, 7_500, {
    amountMinor: 4_000,
    currency: "GHS",
  });
  assert.equal(row.currency, "GHS");
  assert.equal(row.amountKobo, 4_000);
  assert.equal(row.paymentCurrency, "NGN");
  assert.equal(row.paymentAmountMinor, 507_500);

  // Rates move while the customer is paying: the credit does not.
  await setRates({ GHS: 30 });
  charge = { status: "success", amount: 5_075, currency: "NGN" };
  const outcome = await verifyAndSettleTopUp(row.providerReference!);
  assert.deepEqual(outcome, { state: "credited" });
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: 4_000 });
  await setRates();
});

test("a Naira payment for the wrong amount is not credited to a cedi wallet", async () => {
  const user = await newUser("GHS", 0);
  const row = await createPendingTopUp(user.id, 500_000, "NGN", 10_000, 50_000_000, 0, {
    amountMinor: 4_000,
    currency: "GHS",
  });
  charge = { status: "success", amount: 4_000, currency: "NGN" };
  const outcome = await verifyAndSettleTopUp(row.providerReference!);
  assert.equal(outcome.state, "still_pending");
  assert.equal((await balanceOf(user.id)).walletBalanceKobo, 0);
});

test("money moves at the market Naira rate: ₦50,000 is GH₵438.56", async () => {
  const user = await newUser("NGN", 5_000_000);
  const result = await alignWalletCurrency(user, "GHS", { convertBalance: true });
  assert.deepEqual(result, { ok: true, currency: "GHS", changed: true });
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: 43_856 });
});

test("money is never moved at the pricing rate when there is no fresh market Naira rate", () => {
  const pricingOnly = { perUsd: { NGN: 1600, USD: 1, GHS: 11.74 }, asOf: null, stale: false };
  assert.equal(convertMoneyMinor(5_000_000, "NGN", "GHS", pricingOnly), null);
  assert.equal(convertMoneyMinor(1_000, "GHS", "KES", pricingOnly), null); // no KES rate
  assert.equal(convertMoneyMinor(1_000, "GHS", "GHS", pricingOnly), 1_000);
  // A price can still be shown at the pricing rate.
  assert.equal(convertMinor(160_000, "NGN", "GHS", pricingOnly), 1_174);
});

test("the market Naira rate is kept from the feed and used for Naira while fresh", () => {
  const table = parseRateTable({ result: "success", rates: { ...MARKET, USD: 1 } });
  assert.equal(table?.NGN, 1338.47);
  const now = Date.parse("2026-10-14T12:00:00Z");
  const fresh = assembleRates({
    ngnPerUsd: 1600,
    stored: { fetchedAt: "2026-10-14T00:00:00Z", attemptedAt: "2026-10-14T00:00:00Z", rates: table! },
    fundingFallback: {},
    nowMs: now,
  });
  assert.equal(fresh.perUsd.NGN, 1338.47);
  assert.equal(fresh.marketNgnPerUsd, 1338.47);
  const stale = assembleRates({
    ngnPerUsd: 1600,
    stored: { fetchedAt: "2026-09-01T00:00:00Z", attemptedAt: "2026-09-01T00:00:00Z", rates: table! },
    fundingFallback: {},
    nowMs: now,
  });
  assert.equal(stale.perUsd.NGN, 1600);
  assert.equal(stale.marketNgnPerUsd, undefined);
});

test("balances moved at the pricing rate are made good once, at the market rate", async () => {
  const user = await newUser("GHS", 36_660);
  // What the earlier release recorded: ₦50,000 moved to GH₵366.60 at ₦1,600 per USD.
  const move = await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorEmail: user.email,
      action: "wallet.currency.convert",
      targetType: "user",
      targetId: user.id,
      metadata: { from: "NGN", to: "GHS", fromMinor: 5_000_000, toMinor: 36_660 },
    },
  });
  // A Naira payment credited at the pricing rate too: ₦10,000 → GH₵73.32.
  const topUp = await prisma.walletTransaction.create({
    data: {
      userId: user.id,
      type: "TOPUP",
      status: "SUCCESSFUL",
      amountKobo: 7_332,
      currency: "GHS",
      paymentCurrency: "NGN",
      paymentAmountMinor: 1_000_000,
      paymentFeeMinor: 0,
      providerTransactionId: "test",
      description: "Wallet top up",
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { walletBalanceKobo: { increment: 7_332 } } });

  const credited = await correctUnderpaidMoves();
  assert.ok(credited >= 1);
  // GH₵438.56 for the move, GH₵87.71 for the payment.
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: 43_856 + 8_771 });

  // Running it again changes nothing.
  await correctUnderpaidMoves();
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: 43_856 + 8_771 });
  const marks = await prisma.auditLog.count({ where: { action: "wallet.currency.correct", targetId: user.id } });
  assert.equal(marks, 2);
  assert.ok(move.id && topUp.id);
});

test("a move already made at the market rate is not corrected", async () => {
  const user = await newUser("NGN", 5_000_000);
  await alignWalletCurrency(user, "GHS", { convertBalance: true });
  await correctUnderpaidMoves();
  assert.deepEqual(await balanceOf(user.id), { currency: "GHS", walletBalanceKobo: 43_856 });
});
