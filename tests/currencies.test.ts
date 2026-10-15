import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../src/lib/currency";
import {
  CURRENCY_META,
  DISPLAY_CURRENCY_CODES,
  defaultCurrencyForCountry,
  isDisplayCurrencyCode,
} from "../src/lib/currency-meta";
import {
  buildDisplayContext,
  canDisplay,
  convertNgnMinor,
  formatNgnForDisplay,
  formatRecordedForDisplay,
  resolveDisplayCurrency,
  type DisplayRates,
} from "../src/lib/display-currency";
import { allCountries, countryName, isKnownCountry } from "../src/lib/countries";
import { assembleRates, parseRateTable } from "../src/lib/exchange-rates";
import { resolveFee, computeFee, type FeePolicy } from "../src/lib/fee-policy";
import { USDT_FUNDING } from "../src/lib/usdt";
import { isCryptomusConfigured } from "../src/lib/cryptomus";
import { isFundingCurrencyCode } from "../src/lib/funding-currencies";

const rates: DisplayRates = {
  // 1 USD = 1500 NGN = 15 GHS = 129 KES
  perUsd: { NGN: 1500, USD: 1, GHS: 15, KES: 129, XAF: 600, XOF: 600, EGP: 48, TZS: 2600 },
  asOf: "2026-10-14T00:00:00.000Z",
  stale: false,
};

test("the eight display currencies are exactly NGN, GHS, KES, XAF, XOF, EGP, TZS and USD", () => {
  assert.deepEqual([...DISPLAY_CURRENCY_CODES], ["NGN", "GHS", "KES", "XAF", "XOF", "EGP", "TZS", "USD"]);
  for (const banned of ["GBP", "EUR", "ZAR", "CNY", "RWF", "USDT"]) {
    assert.equal(isDisplayCurrencyCode(banned), false, banned);
  }
});

test("house formats match the spec examples", () => {
  assert.equal(formatMoney(500_000, "NGN"), "₦5,000");
  assert.equal(formatMoney(5_000, "GHS"), "GH₵50");
  assert.equal(formatMoney(50_000, "KES"), "KSh500");
  assert.equal(formatMoney(5_000, "XAF"), "5,000 XAF");
  assert.equal(formatMoney(5_000, "XOF"), "5,000 XOF");
  assert.equal(formatMoney(50_000, "EGP"), "E£500");
  assert.equal(formatMoney(500_000, "TZS"), "TSh5,000");
  assert.equal(formatMoney(500, "USD"), "$5.00");
  assert.equal(formatMoney(12_345, "GHS"), "GH₵123.45");
  assert.equal(formatMoney(-250_000, "NGN"), "-₦2,500");
});

test("every displayable currency has a symbol and a name", () => {
  for (const code of DISPLAY_CURRENCY_CODES) {
    assert.ok(CURRENCY_META[code].symbol && CURRENCY_META[code].name, code);
  }
});

test("country defaults: the seven mapped countries get their currency, everyone else USD", () => {
  assert.equal(defaultCurrencyForCountry("NG"), "NGN");
  assert.equal(defaultCurrencyForCountry("gh"), "GHS");
  assert.equal(defaultCurrencyForCountry("KE"), "KES");
  assert.equal(defaultCurrencyForCountry("CM"), "XAF");
  assert.equal(defaultCurrencyForCountry("CI"), "XOF");
  assert.equal(defaultCurrencyForCountry("EG"), "EGP");
  assert.equal(defaultCurrencyForCountry("TZ"), "TZS");
  for (const other of ["GB", "DE", "ZA", "CN", "RW", "US", "IN"]) {
    assert.equal(defaultCurrencyForCountry(other), "USD", other);
  }
  // XAF/XOF are not handed to every country in their zones
  for (const other of ["SN", "ML", "GA", "TD", "CF", "BJ", "TG"]) {
    assert.equal(defaultCurrencyForCountry(other), "USD", other);
  }
  assert.equal(defaultCurrencyForCountry(null), "USD");
  assert.equal(defaultCurrencyForCountry("Nigeria"), "USD");
});

test("country list covers the mapped countries and resolves names", () => {
  for (const iso of ["NG", "GH", "KE", "CM", "CI", "EG", "TZ", "GB", "US"]) {
    assert.ok(isKnownCountry(iso), iso);
  }
  assert.equal(isKnownCountry("XX"), false);
  assert.equal(countryName("GH"), "Ghana");
  assert.ok(allCountries().length > 200);
});

test("display currency order: own preference, saved country, detected country, USD", () => {
  assert.deepEqual(resolveDisplayCurrency({ preference: "KES", savedCountry: "GH", detectedCountry: "NG" }), {
    code: "KES",
    source: "preference",
  });
  assert.deepEqual(resolveDisplayCurrency({ preference: null, savedCountry: "GH", detectedCountry: "NG" }), {
    code: "GHS",
    source: "saved_country",
  });
  assert.deepEqual(resolveDisplayCurrency({ preference: undefined, savedCountry: null, detectedCountry: "TZ" }), {
    code: "TZS",
    source: "detected_country",
  });
  assert.deepEqual(resolveDisplayCurrency({ preference: null, savedCountry: null, detectedCountry: null }), {
    code: "USD",
    source: "fallback",
  });
  // a junk preference is ignored, not trusted
  assert.equal(resolveDisplayCurrency({ preference: "GBP", savedCountry: "EG", detectedCountry: null }).code, "EGP");
  // detection never overrides a saved country
  assert.equal(resolveDisplayCurrency({ preference: null, savedCountry: "GB", detectedCountry: "NG" }).code, "USD");
});

test("conversion: Naira passes through untouched; others go through USD", () => {
  assert.equal(convertNgnMinor(123_456, "NGN", rates), 123_456);
  // ₦1,500 = $1.00 = GH₵15 = KSh129
  assert.equal(convertNgnMinor(150_000, "USD", rates), 100);
  assert.equal(convertNgnMinor(150_000, "GHS", rates), 1_500);
  assert.equal(convertNgnMinor(150_000, "KES", rates), 12_900);
  assert.equal(convertNgnMinor(150_000, "XAF", rates), 600);
  assert.equal(convertNgnMinor(0, "GHS", rates), 0);
});

test("conversion: missing rates give null, never a made-up figure", () => {
  const noKes: DisplayRates = { ...rates, perUsd: { NGN: 1500, USD: 1 } };
  assert.equal(convertNgnMinor(150_000, "KES", noKes), null);
  assert.equal(canDisplay("KES", noKes), false);
  assert.equal(canDisplay("USD", noKes), true);
  const noNgn: DisplayRates = { ...rates, perUsd: { USD: 1, GHS: 15 } };
  assert.equal(convertNgnMinor(150_000, "USD", noNgn), null);
});

test("amounts are shown plainly in the chosen currency, with no approximation mark or Naira", () => {
  assert.equal(formatNgnForDisplay(150_000, "NGN", rates), "₦1,500");
  assert.equal(formatNgnForDisplay(150_000, "USD", rates), "$1.00");
  assert.equal(formatNgnForDisplay(150_000, "GHS", rates), "GH₵15");
  // only with no rate at all does it fall back to the stored amount
  const noKes: DisplayRates = { ...rates, perUsd: { NGN: 1500, USD: 1 } };
  assert.equal(formatNgnForDisplay(150_000, "KES", noKes), "₦1,500");
});

test("a recorded amount is shown as the customer saw it when it is in their current currency", () => {
  assert.equal(formatRecordedForDisplay(150_000, { currency: "GHS", minor: 1_480 }, "GHS", rates), "GH₵14.80");
  // a different currency now: convert the stored amount at today's rate instead
  assert.equal(formatRecordedForDisplay(150_000, { currency: "GHS", minor: 1_480 }, "USD", rates), "$1.00");
  assert.equal(formatRecordedForDisplay(150_000, null, "GHS", rates), "GH₵15");
  assert.equal(formatRecordedForDisplay(150_000, { currency: null, minor: null }, "GHS", rates), "GH₵15");
});

test("display context: an unavailable chosen currency falls back to Naira and says what was asked for", () => {
  const noKes: DisplayRates = { ...rates, perUsd: { NGN: 1500, USD: 1 } };
  const ctx = buildDisplayContext({ preference: "KES", savedCountry: "GH", detectedCountry: null }, noKes);
  assert.equal(ctx.requested, "KES");
  assert.equal(ctx.display, "NGN");
  assert.equal(ctx.countryDefault, "GHS");
  assert.equal(ctx.options.find((o) => o.code === "KES")?.available, false);
  assert.equal(ctx.options.find((o) => o.code === "USD")?.available, true);
});

test("display context keeps country, preference and display separate", () => {
  const ctx = buildDisplayContext({ preference: "USD", savedCountry: "GH", detectedCountry: "NG" }, rates);
  assert.equal(ctx.display, "USD");
  assert.equal(ctx.country, "GH");
  assert.equal(ctx.countrySaved, true);
  assert.equal(ctx.countryDefault, "GHS");
  const guest = buildDisplayContext({ preference: null, savedCountry: null, detectedCountry: "GB" }, rates);
  assert.equal(guest.display, "USD");
  assert.equal(guest.countrySaved, false);
  assert.equal(guest.country, "GB");
});

test("rate table: only a complete, positive, successful table is accepted", () => {
  const good = { result: "success", rates: { GHS: 15, KES: 129, XAF: 600, XOF: 600, EGP: 48, TZS: 2600, USD: 1 } };
  assert.deepEqual(parseRateTable(good), { GHS: 15, KES: 129, XAF: 600, XOF: 600, EGP: 48, TZS: 2600 });
  assert.equal(parseRateTable({ ...good, result: "error" }), null);
  assert.equal(parseRateTable({ result: "success", rates: { GHS: 15 } }), null);
  assert.equal(parseRateTable({ result: "success", rates: { ...good.rates, KES: 0 } }), null);
  assert.equal(parseRateTable({ result: "success", rates: { ...good.rates, KES: "129" } }), null);
  assert.equal(parseRateTable(null), null);
});

test("assembled rates: fresh, stale, funding fallback and nothing", () => {
  const now = Date.parse("2026-10-14T12:00:00.000Z");
  const stored = (fetchedAt: string) => ({
    fetchedAt,
    attemptedAt: fetchedAt,
    rates: { GHS: 15, KES: 129 } as Record<string, number>,
  });
  const fresh = assembleRates({ ngnPerUsd: 1500, stored: stored("2026-10-14T00:00:00.000Z"), fundingFallback: {}, nowMs: now });
  assert.equal(fresh.stale, false);
  assert.equal(fresh.perUsd.GHS, 15);
  assert.equal(fresh.perUsd.NGN, 1500);
  assert.equal(fresh.perUsd.USD, 1);
  assert.equal(fresh.perUsd.TZS, undefined);

  const stale = assembleRates({ ngnPerUsd: 1500, stored: stored("2026-09-01T00:00:00.000Z"), fundingFallback: {}, nowMs: now });
  assert.equal(stale.stale, true);
  assert.equal(stale.perUsd.GHS, 15);

  const fallback = assembleRates({ ngnPerUsd: 1500, stored: null, fundingFallback: { TZS: 2600 }, nowMs: now });
  assert.equal(fallback.perUsd.TZS, 2600);
  assert.equal(fallback.asOf, null);
  assert.equal(fallback.stale, false);

  // the feed beats an admin funding rate for display
  const both = assembleRates({ ngnPerUsd: 1500, stored: stored("2026-10-14T00:00:00.000Z"), fundingFallback: { GHS: 99 }, nowMs: now });
  assert.equal(both.perUsd.GHS, 15);
});

const policy = (over: Partial<FeePolicy> = {}): FeePolicy => ({
  kind: "wallet_funding",
  currency: "NGN",
  model: "percent",
  percent: 1.5,
  fixedMinor: 0,
  capMinor: 200_000,
  approved: true,
  enabled: true,
  approvedBy: "a@test.invalid",
  approvedAt: "2026-10-14T00:00:00.000Z",
  ...over,
});

test("fees: only an approved, enabled policy produces a fee", () => {
  assert.deepEqual(resolveFee(null, 1_000_000), { status: "blocked", feeMinor: 0, reason: "missing" });
  assert.deepEqual(resolveFee(policy({ approved: false }), 1_000_000), { status: "blocked", feeMinor: 0, reason: "unapproved" });
  assert.deepEqual(resolveFee(policy({ approved: false, enabled: true }), 1_000_000).status, "blocked");
  assert.deepEqual(resolveFee(policy({ enabled: false }), 1_000_000), { status: "none", feeMinor: 0 });
  const applied = resolveFee(policy(), 1_000_000);
  assert.equal(applied.status, "applied");
  assert.equal(applied.feeMinor, 15_000);
});

test("fees: percent rounds up and respects the cap; fixed is exact; zero amounts have no fee", () => {
  assert.equal(computeFee(policy(), 333), 5); // ceil(4.995)
  assert.equal(computeFee(policy(), 100_000_000), 200_000); // capped at ₦2,000
  assert.equal(computeFee(policy({ capMinor: null }), 100_000_000), 1_500_000);
  assert.equal(computeFee(policy({ model: "fixed", fixedMinor: 7_500 }), 1_000_000), 7_500);
  assert.equal(computeFee(policy(), 0), 0);
  assert.equal(computeFee(policy(), Number.NaN), 0);
});

test("USDT is off unless Cryptomus is configured, and is not a local or display currency", () => {
  const saved = { id: process.env.CRYPTOMUS_MERCHANT_ID, key: process.env.CRYPTOMUS_PAYMENT_API_KEY };
  delete process.env.CRYPTOMUS_MERCHANT_ID;
  delete process.env.CRYPTOMUS_PAYMENT_API_KEY;
  assert.equal(isCryptomusConfigured(), false);
  process.env.CRYPTOMUS_MERCHANT_ID = "merchant";
  assert.equal(isCryptomusConfigured(), false);
  process.env.CRYPTOMUS_PAYMENT_API_KEY = "key";
  assert.equal(isCryptomusConfigured(), true);
  if (saved.id === undefined) delete process.env.CRYPTOMUS_MERCHANT_ID;
  else process.env.CRYPTOMUS_MERCHANT_ID = saved.id;
  if (saved.key === undefined) delete process.env.CRYPTOMUS_PAYMENT_API_KEY;
  else process.env.CRYPTOMUS_PAYMENT_API_KEY = saved.key;
  assert.equal(isFundingCurrencyCode("USDT"), false);
  assert.equal(isDisplayCurrencyCode("USDT"), false);
  assert.match(USDT_FUNDING.comingSoonMessage, /coming soon/i);
});

test("zero is shown plainly, without the ≈ mark", () => {
  assert.equal(formatNgnForDisplay(0, "USD", rates), "$0.00");
  assert.equal(formatNgnForDisplay(0, "GHS", rates), "GH₵0");
  assert.equal(formatNgnForDisplay(0, "NGN", rates), "₦0");
});
