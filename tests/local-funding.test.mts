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
const { saveFeePolicy, resolveFundingFee } = await import("../src/lib/fee-policy");

const admin = { email: "tests@test.invalid" };
async function setFee(
  currency: "NGN" | "GHS" | "KES" | "XAF",
  over: { approved?: boolean; enabled?: boolean; percent?: number } = {},
) {
  const r = await saveFeePolicy(
    "wallet_funding",
    currency,
    {
      model: "percent",
      percent: over.percent ?? 1.5,
      fixedMinor: 0,
      capMinor: null,
      approved: over.approved ?? true,
      enabled: over.enabled ?? true,
    },
    admin,
  );
  assert.equal(r.ok, true);
}
async function clearFees() {
  await prisma.setting.deleteMany({ where: { key: SETTING_KEYS.feePolicies } });
}

type Charge = { status: string; amount?: number | string; currency?: string; payment_method?: string; fee?: number | string; vat?: number | string; amount_charged?: number | string };
let charge: Charge = { status: "pending" };
const realFetch = globalThis.fetch;

let userId = "";
let savedSetting: string | null = null;
let savedFees: string | null = null;

before(async () => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/charges/") && !url.includes("initialize")) {
      const reference = decodeURIComponent(url.split("/charges/")[1]);
      return new Response(JSON.stringify({ status: true, message: "ok", data: { reference, ...charge } }), {
        status: 200,
      });
    }
    return realFetch(input as RequestInfo);
  }) as typeof fetch;

  savedSetting = (await prisma.setting.findUnique({ where: { key: SETTING_KEYS.fundingCurrencies } }))?.value ?? null;
  await prisma.setting.deleteMany({ where: { key: SETTING_KEYS.fundingCurrencies } });
  savedFees = (await prisma.setting.findUnique({ where: { key: SETTING_KEYS.feePolicies } }))?.value ?? null;
  await clearFees();

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
  await clearFees();
  if (savedFees !== null) {
    await prisma.setting.create({ data: { key: SETTING_KEYS.feePolicies, value: savedFees } });
  }
  await prisma.$disconnect();
});

async function balance() {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).walletBalanceKobo;
}

async function enable(code: "GHS" | "KES" | "XAF" = "GHS", usdRate = 15) {
  await setFee(code);
  const r = await saveFundingState(code, {
    enabled: true,
    usdRate,
    minMinor: code === "XAF" ? 500 : 1000,
    maxMinor: code === "XAF" ? 1_000_000 : 1_000_000,
  });
  assert.equal(r.ok, true);
}

test("everything is off by default: no options, every quote refused", async () => {
  const states = await readFundingStates();
  for (const s of Object.values(states)) assert.equal(s.enabled, false);
  assert.deepEqual(await getFundingOptions(), []);
  const q = await quoteLocalFunding({ currency: "GHS", amountMinor: 10_000 });
  assert.deepEqual(q.ok, false);
  assert.equal(!q.ok && q.error, "currency_unavailable");
});

test("a currency cannot be enabled without a rate", async () => {
  const r = await saveFundingState("KES", { enabled: true, usdRate: 0, minMinor: 1000, maxMinor: 5000 });
  assert.deepEqual(r, { ok: false, error: "rate_required" });
});

test("a currency cannot be switched on until its fee decision is approved", async () => {
  await clearFees();
  const patch = { enabled: true, usdRate: 129, minMinor: 1000, maxMinor: 5000 };
  assert.deepEqual(await saveFundingState("KES", patch), { ok: false, error: "fee_not_approved" });
  await setFee("KES", { approved: false, enabled: false });
  assert.deepEqual(await saveFundingState("KES", patch), { ok: false, error: "fee_not_approved" });
  await setFee("KES", { approved: true, enabled: false }); // approved: no fee
  assert.deepEqual(await saveFundingState("KES", patch), { ok: true });
  await saveFundingState("KES", { ...patch, enabled: false });
  await clearFees();
});

test("a fee cannot be switched on without being approved", async () => {
  const r = await saveFeePolicy(
    "wallet_funding",
    "GHS",
    { model: "percent", percent: 2, fixedMinor: 0, capMinor: null, approved: false, enabled: true },
    admin,
  );
  assert.deepEqual(r, { ok: false, error: "enable_needs_approval" });
  const bad = await saveFeePolicy(
    "wallet_funding",
    "GHS",
    { model: "percent", percent: 99, fixedMinor: 0, capMinor: null, approved: true, enabled: true },
    admin,
  );
  assert.deepEqual(bad, { ok: false, error: "percent_invalid" });
});

test("approving a fee records who and when", async () => {
  await setFee("GHS", { percent: 2 });
  const q = await resolveFundingFee("GHS", 10_000);
  assert.equal(q.status, "applied");
  assert.equal(q.status === "applied" && q.feeMinor, 200);
  assert.equal(q.status === "applied" && q.policy.approvedBy, "tests@test.invalid");
  assert.ok(q.status === "applied" && q.policy.approvedAt);
  await clearFees();
});

test("an enabled currency is offered to every customer, and only enabled ones are", async () => {
  await enable("GHS");
  assert.deepEqual((await getFundingOptions()).map((o) => o.code), ["GHS"]);
});

test("server rejects unsupported or switched-off currencies and bad amounts", async () => {
  const bad = async (input: Parameters<typeof quoteLocalFunding>[0]) => {
    const r = await quoteLocalFunding(input);
    return r.ok ? "ok" : r.error;
  };
  assert.equal(await bad({ currency: "USD", amountMinor: 10_000 }), "unsupported_currency");
  assert.equal(await bad({ currency: "EUR", amountMinor: 10_000 }), "unsupported_currency");
  assert.equal(await bad({ currency: "NGN", amountMinor: 10_000 }), "unsupported_currency");
  assert.equal(await bad({ currency: undefined, amountMinor: 10_000 }), "unsupported_currency");
  assert.equal(await bad({ currency: "KES", amountMinor: 10_000 }), "currency_unavailable");
  assert.equal(await bad({ currency: "GHS", amountMinor: 100 }), "amount_too_low");
  assert.equal(await bad({ currency: "GHS", amountMinor: 99_999_999 }), "amount_too_high");
  assert.equal(await bad({ currency: "GHS", amountMinor: 1234.5 }), "amount_invalid");
  assert.equal(await bad({ currency: "GHS", amountMinor: Number.NaN }), "amount_invalid");
  assert.equal(await bad({ currency: "GHS", amountMinor: 10_000 }), "ok");
});

async function pendingGhs(amountMinor = 10_000) {
  const quoted = await quoteLocalFunding({ currency: "GHS", amountMinor });
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

test("with no approved fee decision, a local payment is refused, not given a guessed fee", async () => {
  await enable("GHS");
  await clearFees();
  const refused = await quoteLocalFunding({ currency: "GHS", amountMinor: 10_000 });
  assert.equal(!refused.ok && refused.error, "fee_not_configured");
  assert.deepEqual(await getFundingOptions(), []);

  const draft = await saveFeePolicy(
    "wallet_funding",
    "GHS",
    { model: "percent", percent: 2, fixedMinor: 0, capMinor: null, approved: false, enabled: false },
    admin,
  );
  assert.equal(draft.ok, true);
  const stillRefused = await quoteLocalFunding({ currency: "GHS", amountMinor: 10_000 });
  assert.equal(!stillRefused.ok && stillRefused.error, "fee_not_configured");
});

test("an approved but disabled fee means no fee: payment goes ahead and no fee is applied", async () => {
  await setFee("GHS", { approved: true, enabled: false });
  const q = await quoteLocalFunding({ currency: "GHS", amountMinor: 10_000 });
  assert.ok(q.ok);
  assert.equal(q.quote.feeMinor, 0);
  assert.equal(q.quote.totalMinor, 10_000);
});

test("the fee shown in the quote is exactly the approved fee, and the pending row records it", async () => {
  await setFee("GHS", { percent: 2.5 });
  const q = await quoteLocalFunding({ currency: "GHS", amountMinor: 20_000 });
  assert.ok(q.ok);
  assert.equal(q.quote.feeMinor, 500); // 2.5% of GH₵200
  const row = await createPendingLocalTopUp(userId, q.quote);
  assert.equal(row.paymentFeeMinor, 500);
  assert.equal(row.paymentAmountMinor, 20_500);
  // changing the fee afterwards does not rewrite what this payment was quoted
  await setFee("GHS", { percent: 9 });
  const again = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(again.paymentFeeMinor, 500);
  await setFee("GHS", { percent: 1.5 });
});

test("CFA amounts that are not multiples of 5 are rejected by the server", async () => {
  await enable("XAF", 600);
  const odd = await quoteLocalFunding({ currency: "XAF", amountMinor: 10_003 });
  assert.equal(!odd.ok && odd.error, "amount_step");
  const even = await quoteLocalFunding({ currency: "XAF", amountMinor: 10_005 });
  assert.ok(even.ok);
  assert.equal(even.quote.totalMinor % 5, 0);
});

test("USDT, USD and every other non-listed currency are refused by the same checks", async () => {
  await enable("GHS");
  for (const currency of ["USDT", "USD", "GBP", "EUR", "ZAR", "CNY", "RWF", "NGN"]) {
    const q = await quoteLocalFunding({ currency, amountMinor: 10_000 });
    assert.equal(!q.ok && q.error, "unsupported_currency", currency);
  }
});

test("KoraPay's own fee, VAT and total are recorded when it reports them, and left empty when it does not", async () => {
  await enable("GHS");
  const { row, quote } = await pendingGhs(10_000);
  charge = {
    status: "success",
    amount: String(quote.totalMinor / 100),
    currency: "GHS",
    payment_method: "mobile_money",
    fee: 1.2,
    vat: "0.18",
    amount_charged: quote.totalMinor / 100,
  } as Charge;
  const outcome = await reconcileTopUp(row.providerReference!, "WEBHOOK");
  assert.equal(outcome.state, "credited");
  const saved = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(saved.providerFeeMinor, 120);
  assert.equal(saved.providerVatMinor, 18);
  assert.equal(saved.providerChargedMinor, quote.totalMinor);

  const second = await pendingGhs(10_000);
  charge = { status: "success", amount: second.quote.totalMinor / 100, currency: "GHS" };
  await reconcileTopUp(second.row.providerReference!, "WEBHOOK");
  const none = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: second.row.id } });
  assert.equal(none.status, "SUCCESSFUL");
  assert.equal(none.providerFeeMinor, null);
  assert.equal(none.providerVatMinor, null);
});

test("Naira funding records the approved fee on the row and still credits only the requested amount", async () => {
  await setFee("NGN", { percent: 1.5 });
  const fee = await resolveFundingFee("NGN", 1_000_000);
  assert.equal(fee.status, "applied");
  const feeKobo = fee.feeMinor;
  assert.equal(feeKobo, 15_000);

  const before = await balance();
  const row = await createPendingTopUp(userId, 1_000_000, "NGN", 10_000, 100_000_000, feeKobo);
  assert.equal(row.paymentFeeMinor, 15_000);
  assert.equal(row.paymentAmountMinor, 1_015_000);
  assert.equal(row.paymentCurrency, null);
  charge = { status: "success", amount: "10150", currency: "NGN", fee: 152.25 } as Charge;
  const outcome = await verifyAndSettleTopUp(row.providerReference!);
  assert.equal(outcome.state, "credited");
  assert.equal(await balance(), before + 1_000_000);
  const saved = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(saved.providerFeeMinor, 15_225);
});

test("a Naira payment is blocked when no approved fee decision exists", async () => {
  await clearFees();
  const fee = await resolveFundingFee("NGN", 1_000_000);
  assert.equal(fee.status, "blocked");
});

test("a Naira top-up with a fee is credited when KoraPay reports the full amount it charged (amount + fee)", async () => {
  await setFee("NGN", { percent: 1.5 });
  const before = await balance();
  const row = await createPendingTopUp(userId, 1_000_000, "NGN", 10_000, 100_000_000, 15_000);
  charge = { status: "success", amount: 10_150, currency: "NGN" }; // numeric, total charged
  assert.equal((await verifyAndSettleTopUp(row.providerReference!)).state, "credited");
  assert.equal(await balance(), before + 1_000_000);

  // and a numeric amount that is neither is still refused
  const other = await createPendingTopUp(userId, 1_000_000, "NGN", 10_000, 100_000_000, 15_000);
  charge = { status: "success", amount: 9_000, currency: "NGN" };
  assert.deepEqual(await verifyAndSettleTopUp(other.providerReference!), {
    state: "still_pending",
    reason: "amount_mismatch",
  });
});

test("saving fees for different currencies at the same moment keeps every change", async () => {
  await clearFees();
  await Promise.all([
    setFee("GHS", { percent: 1 }),
    setFee("KES", { percent: 2 }),
    setFee("XAF", { percent: 3 }),
    setFee("NGN", { percent: 1.5 }),
  ]);
  for (const [code, pct] of [["GHS", 1], ["KES", 2], ["XAF", 3], ["NGN", 1.5]] as const) {
    const fee = await resolveFundingFee(code, 10_000);
    assert.equal(fee.status, "applied", code);
    assert.equal(fee.status === "applied" && fee.policy.percent, pct, code);
  }
});

test("saving funding switches for different currencies at the same moment keeps every change", async () => {
  await Promise.all([setFee("GHS"), setFee("KES")]);
  await Promise.all([
    saveFundingState("GHS", { enabled: true, usdRate: 15, minMinor: 1000, maxMinor: 1_000_000 }),
    saveFundingState("KES", { enabled: true, usdRate: 129, minMinor: 1000, maxMinor: 1_000_000 }),
  ]);
  const states = await readFundingStates();
  assert.equal(states.GHS.enabled, true);
  assert.equal(states.KES.enabled, true);
  await saveFundingState("KES", { enabled: false, usdRate: 129, minMinor: 1000, maxMinor: 1_000_000 });
});

test("customers can change their own country, every change is audit-logged, and it is rate limited", async () => {
  const { changeOwnCountry, COUNTRY_CHANGES_PER_DAY } = await import("../src/lib/user-country");
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const actor = { id: me.id, email: me.email };
  await prisma.auditLog.deleteMany({ where: { targetId: userId, action: "user.country.self_update" } });
  await prisma.user.update({ where: { id: userId }, data: { country: "GH" } });

  assert.deepEqual(await changeOwnCountry(actor, "XX"), { ok: false, error: "invalid_country" });
  assert.deepEqual(await changeOwnCountry(actor, "Ghana"), { ok: false, error: "invalid_country" });
  assert.deepEqual(await changeOwnCountry(actor, "gh"), { ok: true, country: "GH", changed: false });

  assert.deepEqual(await changeOwnCountry(actor, "KE"), { ok: true, country: "KE", changed: true });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).country, "KE");
  const log = await prisma.auditLog.findMany({ where: { targetId: userId, action: "user.country.self_update" } });
  assert.equal(log.length, 1);
  assert.deepEqual(log[0].metadata, { before: "GH", after: "KE" });

  // Racing changes: exactly one wins per old value, and the audit trail matches reality.
  const results = await Promise.all([changeOwnCountry(actor, "TZ"), changeOwnCountry(actor, "EG")]);
  assert.equal(results.filter((r) => r.ok && r.changed).length, 1);
  const trail = await prisma.auditLog.findMany({
    where: { targetId: userId, action: "user.country.self_update" },
    orderBy: { createdAt: "asc" },
  });
  const last = trail[trail.length - 1].metadata as { after: string };
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).country, last.after);

  // Daily limit
  for (const c of ["NG", "GH", "KE", "CM", "CI", "EG", "TZ"]) await changeOwnCountry(actor, c);
  const count = await prisma.auditLog.count({ where: { targetId: userId, action: "user.country.self_update" } });
  assert.equal(count, COUNTRY_CHANGES_PER_DAY);
  const current = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).country;
  assert.deepEqual(await changeOwnCountry(actor, current === "US" ? "GB" : "US"), { ok: false, error: "too_many_changes" });
  // a day later it is allowed again
  const tomorrow = Date.now() + 25 * 60 * 60 * 1000;
  assert.equal((await changeOwnCountry(actor, current === "US" ? "GB" : "US", tomorrow)).ok, true);
  await prisma.auditLog.deleteMany({ where: { targetId: userId, action: "user.country.self_update" } });
});
