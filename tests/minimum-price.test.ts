import test from "node:test";
import assert from "node:assert/strict";
import { quoteForPair, quoteForCurrency, minimumPriceKobo, minimumPriceInCurrency, type MarginRules } from "../src/lib/pricing";
import type { CurrencyConfigEntry } from "../src/lib/currency-config";

const NGN = { code: "NGN", usdRate: 1600 } as CurrencyConfigEntry;
const USD = { code: "USD", usdRate: 1 } as CurrencyConfigEntry;
const rules: MarginRules = { defaultMultiplier: 3, exclusiveMultiplier: 1.43, serviceOverrides: new Map() };
const CHEAP = 5; // $0.05, priced well under NGN 500 at 3x

test("TikTok sells for at least NGN 750 everywhere", () => {
  assert.equal(quoteForPair(rules, CHEAP, "tiktok", "usa", NGN).customerPriceKobo, 75_000);
  assert.equal(quoteForCurrency(rules, CHEAP, "tiktok", NGN).customerPriceKobo, 75_000);
});

test("UK numbers sell for at least NGN 1,000, for every service, repeat listings included", () => {
  assert.equal(quoteForPair(rules, CHEAP, "whatsapp", "united-kingdom", NGN).customerPriceKobo, 100_000);
  assert.equal(quoteForPair(rules, CHEAP, "tiktok", "united-kingdom", NGN).customerPriceKobo, 100_000);
  assert.equal(minimumPriceKobo("telegram", "united-kingdom-2"), 100_000);
});

test("everything else keeps the NGN 500 minimum, and dearer numbers are unchanged", () => {
  assert.equal(quoteForPair(rules, CHEAP, "whatsapp", "usa", NGN).customerPriceKobo, 50_000);
  const dear = quoteForPair(rules, 100, "tiktok", "united-kingdom", NGN); // $1.00 cost
  assert.ok(dear.customerPriceKobo > 100_000);
  assert.equal(dear.customerPriceKobo, quoteForPair(rules, 100, "tiktok", "usa", NGN).customerPriceKobo);
});

test("US dollar accounts get the same minimums at the day's Naira rate, in whole price steps", () => {
  const usd = { ...USD, ngnPerUsd: 1338 } as CurrencyConfigEntry;
  // NGN 1,000 / 1,338 = $0.75 and NGN 750 = $0.56: both round up to $1, the
  // smallest US dollar price there is.
  assert.equal(minimumPriceInCurrency(100_000, usd), 100);
  assert.equal(minimumPriceInCurrency(75_000, usd), 100);
  assert.equal(quoteForPair(rules, CHEAP, "whatsapp", "united-kingdom", usd).customerPriceKobo, 100);
  // A higher minimum, or a weaker Naira, moves the dollar floor with it.
  assert.equal(minimumPriceInCurrency(200_000, usd), 200); // $1.49 -> $2
  assert.equal(minimumPriceInCurrency(200_000, { ...USD, ngnPerUsd: 2100 } as CurrencyConfigEntry), 100); // $0.95 -> $1
});

test("the general NGN 500 minimum is Naira only, and no rate means no dollar minimum", () => {
  const usd = { ...USD, ngnPerUsd: 1338 } as CurrencyConfigEntry;
  assert.equal(minimumPriceInCurrency(50_000, usd), 0);
  assert.equal(minimumPriceInCurrency(100_000, USD), 0);
});
