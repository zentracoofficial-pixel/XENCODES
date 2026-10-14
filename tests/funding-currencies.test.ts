import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  FUNDING_CURRENCY_CODES,
  FUNDING_CURRENCIES,
  computeFundingQuote,
  currencySupportsCountry,
  fundingCurrencyForCountry,
  isFundingCurrencyCode,
  localFundingErrorCopy,
  pickerCountries,
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

test("a currency only supports its own country", () => {
  assert.equal(currencySupportsCountry("GHS", "GH"), true);
  assert.equal(currencySupportsCountry("GHS", "KE"), false);
  assert.equal(currencySupportsCountry("XAF", "CI"), false);
  assert.equal(currencySupportsCountry("XOF", "CI"), true);
  assert.equal(currencySupportsCountry("KES", null), false);
});

test("the country picker offers Nigeria and the six countries only", () => {
  assert.deepEqual(
    pickerCountries().map((c) => c.iso2),
    ["NG", "GH", "KE", "CM", "CI", "EG", "TZ"],
  );
});

test("quote: fee goes on top and is never credited", () => {
  // 1 USD = 1500 NGN = 15 GHS, so 1 GHS = 100 NGN.
  const q = computeFundingQuote({
    currency: "GHS",
    amountMinor: 10_000, // GH₵100.00
    currencyUsdRate: 15,
    ngnUsdRate: 1500,
    feePercent: 1.5,
  })!;
  assert.equal(q.feeMinor, 150);
  assert.equal(q.totalMinor, 10_150);
  assert.equal(q.ngnPerUnit, 100);
  assert.equal(q.creditKobo, 1_000_000); // ₦10,000.00 from GH₵100 alone
});

test("quote: XAF totals round up to a multiple of 5 and the rounding goes into the fee", () => {
  const q = computeFundingQuote({
    currency: "XAF",
    amountMinor: 10_003,
    currencyUsdRate: 600,
    ngnUsdRate: 1500,
    feePercent: 1.5,
  })!;
  assert.equal(q.totalMinor % 5, 0);
  assert.ok(q.totalMinor >= 10_003 + 150);
  assert.equal(q.feeMinor, q.totalMinor - 10_003);
  // credit depends on the amount alone: 10003 XAF at 2.5 NGN each
  assert.equal(q.creditKobo, Math.floor(10_003 * 2.5 * 100));
});

test("quote: credit is floored, never rounded up", () => {
  const q = computeFundingQuote({
    currency: "KES",
    amountMinor: 12_345,
    currencyUsdRate: 129,
    ngnUsdRate: 1500,
    feePercent: 0,
  })!;
  const exact = (123.45 * 1500) / 129 * 100;
  assert.equal(q.creditKobo, Math.floor(exact + 1e-9));
  assert.ok(q.creditKobo <= exact + 1e-6);
  assert.equal(q.feeMinor, 0);
});

test("quote: refuses nonsense inputs", () => {
  const base = { currency: "GHS" as const, amountMinor: 1000, currencyUsdRate: 15, ngnUsdRate: 1500, feePercent: 1 };
  assert.equal(computeFundingQuote({ ...base, currencyUsdRate: 0 }), null);
  assert.equal(computeFundingQuote({ ...base, ngnUsdRate: -1 }), null);
  assert.equal(computeFundingQuote({ ...base, amountMinor: 0 }), null);
  assert.equal(computeFundingQuote({ ...base, amountMinor: 10.5 }), null);
  assert.equal(computeFundingQuote({ ...base, feePercent: 80 }), null);
  assert.equal(computeFundingQuote({ ...base, feePercent: Number.NaN }), null);
});

test("amount limits", () => {
  assert.equal(validateLocalAmount(500, 1000, 5000), "amount_too_low");
  assert.equal(validateLocalAmount(6000, 1000, 5000), "amount_too_high");
  assert.equal(validateLocalAmount(1000, 1000, 5000), null);
  assert.equal(validateLocalAmount(5000, 1000, 5000), null);
  assert.equal(validateLocalAmount(Number.NaN, 1000, 5000), "amount_invalid");
  assert.equal(validateLocalAmount(1.5, 1000, 5000), "amount_invalid");
});

test("customer-facing wording exists for every refusal", () => {
  for (const code of [
    "not_connected",
    "unsupported_currency",
    "currency_unavailable",
    "country_required",
    "unsupported_country",
    "amount_invalid",
    "amount_too_low",
    "amount_too_high",
    "rate_unavailable",
    "wallet_currency",
  ] as const) {
    assert.ok(localFundingErrorCopy(code, "GHS", { minMinor: 1000, maxMinor: 5000 }).length > 10, code);
  }
  assert.match(localFundingErrorCopy("amount_too_low", "GHS", { minMinor: 1000, maxMinor: 5000 }), /GH₵10/);
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
