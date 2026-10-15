import test from "node:test";
import assert from "node:assert/strict";
import { quoteForPair, quoteForCurrency, minimumPriceKobo, type MarginRules } from "../src/lib/pricing";
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

test("the minimums are Naira only", () => {
  assert.equal(
    quoteForPair(rules, CHEAP, "tiktok", "united-kingdom", USD).customerPriceKobo,
    quoteForPair(rules, CHEAP, "whatsapp", "usa", USD).customerPriceKobo,
  );
});
