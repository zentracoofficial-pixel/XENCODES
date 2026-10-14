import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  FUNDING_CURRENCY_CODES,
  FUNDING_CURRENCIES,
  computeFundingQuote,
  fundingRateDeviationPercent,
  fundingCurrencyForCountry,
  isFundingCurrencyCode,
  localFundingErrorCopy,
  validateLocalAmount,
} from "../src/lib/funding-currencies";
import { parseMinorAmount, verifyKorapayWebhookSignature } from "../src/lib/korapay";

test("exactly the six requested local currencies exist, and no others", () => {
  assert.deepEqual([...FUNDING_CURRENCY_CODES], ["GHS", "KES", "XAF", "XOF", "EGP", "TZS"]);
  for (const banned of ["USD", "GBP", "EUR", "ZAR", "CNY", "RWF", "NGN", "USDT"]) {
    assert.equal(isFundingCurrencyCode(banned), false, banned);
  }
  assert.equal(isFundingCurrencyCode(undefined), false);
  assert.equal(isFundingCurrencyCode("ghs"), false);
});

test("each country maps to its currency; Nigeria and unknown countries map to none", () => {
  assert.equal(fundingCurrencyForCountry("GH"), "GHS");
  assert.equal(fundingCurrencyForCountry("ke"), "KES");
  assert.equal(fundingCurrencyForCountry("CM"), "XAF");
  assert.equal(fundingCurrencyForCountry("CI"), "XOF");
  assert.equal(fundingCurrencyForCountry("EG"), "EGP");
  assert.equal(fundingCurrencyForCountry("TZ"), "TZS");
  assert.equal(fundingCurrencyForCountry("NG"), null);
  assert.equal(fundingCurrencyForCountry("US"), null);
  assert.equal(fundingCurrencyForCountry(null), null);
  assert.equal(fundingCurrencyForCountry("GHA"), null);
});

test("quote: an approved fee goes on top and is never credited", () => {
  // 1 USD = 1500 NGN = 15 GHS, so 1 GHS = 100 NGN.
  const q = computeFundingQuote({
    currency: "GHS",
    amountMinor: 10_000, // GH₵100.00
    currencyUsdRate: 15,
    ngnUsdRate: 1500,
    approvedFeeMinor: 150,
  })!;
  assert.equal(q.feeMinor, 150);
  assert.equal(q.totalMinor, 10_150);
  assert.equal(q.ngnPerUnit, 100);
  assert.equal(q.creditKobo, 1_000_000); // ₦10,000.00 from GH₵100 alone
});

test("quote: no approved fee means no fee and total equals amount", () => {
  const q = computeFundingQuote({
    currency: "KES",
    amountMinor: 12_345,
    currencyUsdRate: 129,
    ngnUsdRate: 1500,
    approvedFeeMinor: 0,
  })!;
  assert.equal(q.feeMinor, 0);
  assert.equal(q.totalMinor, 12_345);
  const exact = ((123.45 * 1500) / 129) * 100;
  assert.equal(q.creditKobo, Math.floor(exact + 1e-9));
  assert.ok(q.creditKobo <= exact + 1e-6);
});

test("quote: CFA amounts must be multiples of 5, so no rounding is ever added to what the customer pays", () => {
  const base = { currency: "XAF" as const, currencyUsdRate: 600, ngnUsdRate: 1500 };
  assert.equal(computeFundingQuote({ ...base, amountMinor: 10_003, approvedFeeMinor: 0 }), null);
  const none = computeFundingQuote({ ...base, amountMinor: 10_005, approvedFeeMinor: 0 })!;
  assert.equal(none.feeMinor, 0);
  assert.equal(none.totalMinor, 10_005);
  // an approved fee is rounded up to the step so the total stays chargeable
  const withFee = computeFundingQuote({ ...base, amountMinor: 10_005, approvedFeeMinor: 153 })!;
  assert.equal(withFee.feeMinor, 155);
  assert.equal(withFee.totalMinor % 5, 0);
  assert.equal(withFee.creditKobo, Math.floor(10_005 * 2.5 * 100));
});

test("quote: refuses nonsense inputs", () => {
  const base = { currency: "GHS" as const, amountMinor: 1000, currencyUsdRate: 15, ngnUsdRate: 1500, approvedFeeMinor: 10 };
  assert.equal(computeFundingQuote({ ...base, currencyUsdRate: 0 }), null);
  assert.equal(computeFundingQuote({ ...base, ngnUsdRate: -1 }), null);
  assert.equal(computeFundingQuote({ ...base, amountMinor: 0 }), null);
  assert.equal(computeFundingQuote({ ...base, amountMinor: 10.5 }), null);
  assert.equal(computeFundingQuote({ ...base, approvedFeeMinor: -1 }), null);
  assert.equal(computeFundingQuote({ ...base, approvedFeeMinor: 1.5 }), null);
});

test("amount limits and step", () => {
  assert.equal(validateLocalAmount(500, 1000, 5000), "amount_too_low");
  assert.equal(validateLocalAmount(6000, 1000, 5000), "amount_too_high");
  assert.equal(validateLocalAmount(1000, 1000, 5000), null);
  assert.equal(validateLocalAmount(5000, 1000, 5000), null);
  assert.equal(validateLocalAmount(Number.NaN, 1000, 5000), "amount_invalid");
  assert.equal(validateLocalAmount(1.5, 1000, 5000), "amount_invalid");
  assert.equal(validateLocalAmount(1003, 1000, 5000, 5), "amount_step");
  assert.equal(validateLocalAmount(1005, 1000, 5000, 5), null);
});

test("customer-facing wording exists for every refusal", () => {
  for (const code of [
    "not_connected",
    "unsupported_currency",
    "currency_unavailable",
    "amount_invalid",
    "amount_too_low",
    "amount_too_high",
    "rate_unavailable",
    "amount_step",
    "fee_not_configured",
  ] as const) {
    assert.ok(localFundingErrorCopy(code, "GHS", { minMinor: 1000, maxMinor: 5000 }).length > 10, code);
  }
  assert.match(localFundingErrorCopy("amount_too_low", "GHS", { minMinor: 1000, maxMinor: 5000 }), /GH₵10/);
  assert.match(localFundingErrorCopy("amount_step", "XAF"), /multiples of 5/);
});

test("every currency has methods, a symbol and a sane default range", () => {
  for (const code of FUNDING_CURRENCY_CODES) {
    const meta = FUNDING_CURRENCIES[code];
    assert.ok(meta.methods.length > 0 && meta.symbol && meta.countries.length > 0, code);
    assert.ok(meta.defaultMinMajor > 0 && meta.defaultMaxMajor > meta.defaultMinMajor, code);
  }
});

test("KoraPay amounts parse from numbers and numeric strings, and refuse anything else", () => {
  assert.equal(parseMinorAmount(100, 100), 10_000);
  assert.equal(parseMinorAmount("100.50", 100), 10_050);
  assert.equal(parseMinorAmount("5000", 1), 5000);
  assert.equal(parseMinorAmount(undefined, 100), undefined);
  assert.equal(parseMinorAmount("", 100), undefined);
  assert.equal(parseMinorAmount("abc", 100), undefined);
  assert.equal(parseMinorAmount(-5, 100), undefined);
  assert.equal(parseMinorAmount("1.005", 100), undefined);
});

test("webhook signature: valid with either key, invalid otherwise", () => {
  process.env.KORAPAY_ENCRYPTION_KEY = "enc_test_key";
  process.env.KORAPAY_SECRET_KEY = "sk_test_key";
  const data = { reference: "xen_x", status: "success", currency: "GHS" };
  const sign = (key: string) => createHmac("sha256", key).update(JSON.stringify(data)).digest("hex");
  assert.equal(verifyKorapayWebhookSignature(data, sign("enc_test_key")), true);
  assert.equal(verifyKorapayWebhookSignature(data, sign("sk_test_key")), true);
  assert.equal(verifyKorapayWebhookSignature(data, sign("someone_else")), false);
  assert.equal(verifyKorapayWebhookSignature(data, null), false);
  assert.equal(verifyKorapayWebhookSignature({ ...data, status: "failed" }, sign("enc_test_key")), false);
});

test("funding rate deviation flags rates that credit more Naira than the market", () => {
  assert.equal(fundingRateDeviationPercent(15, 15), 0);
  // admin says 10 GHS per USD, market 15: each GHS credits 50% more Naira
  assert.equal(Math.round(fundingRateDeviationPercent(10, 15)!), 50);
  assert.ok(fundingRateDeviationPercent(16, 15)! < 0);
  assert.equal(fundingRateDeviationPercent(15, undefined), null);
  assert.equal(fundingRateDeviationPercent(0, 15), null);
});
