import test from "node:test";
import assert from "node:assert/strict";
import { quoteForProvider, quoteForPair, type MarginRules } from "../src/lib/pricing";
import type { CurrencyConfigEntry } from "../src/lib/currency-config";

const rules: MarginRules = { defaultMultiplier: 3, exclusiveMultiplier: 2, serviceOverrides: new Map([["telegram", 5]]) };
// Platform pricing rate NGN 1,600; market rate NGN 1,400.
const ngn = { code: "NGN", usdRate: 1600, ngnPerUsd: 1400 } as CurrencyConfigEntry;
const usd = { code: "USD", usdRate: 1, ngnPerUsd: 1600 } as CurrencyConfigEntry;

test("Server II is 3.5x its cost in Naira at the market rate, rounded up to NGN 1", () => {
  // $0.50 = NGN 700 at the market rate; x3.5 = NGN 2,450.
  const q = quoteForProvider(rules, "dogesms", 50, "whatsapp", "usa", ngn);
  assert.equal(q.providerCostKobo, 70_000);
  assert.equal(q.customerPriceKobo, 245_000);
  assert.equal(q.multiplier, 3.5);
  assert.equal(q.rule, "provider");
  // $0.33 = NGN 462; x3.5 = NGN 1,617.
  assert.equal(quoteForProvider(rules, "dogesms", 33, "whatsapp", "usa", ngn).customerPriceKobo, 161_700);
  // Shown to a dollar wallet at that same market rate: $1.75, 3.5x $0.50.
  assert.equal(Math.round((q.customerPriceKobo / 100 / 1400) * 100), 175);
});

test("without a fresh market rate, Naira falls back to the platform rate", () => {
  const q = quoteForProvider(rules, "dogesms", 50, "whatsapp", "usa", { ...ngn, ngnPerUsd: undefined });
  assert.equal(q.customerPriceKobo, 280_000);
});

test("Server II is 3.5x its cost in US dollars, to the cent", () => {
  assert.equal(quoteForProvider(rules, "dogesms", 50, "whatsapp", "usa", usd).customerPriceKobo, 175);
  assert.equal(quoteForProvider(rules, "dogesms", 33, "whatsapp", "usa", usd).customerPriceKobo, 116); // 115.5 up
});

test("Server II ignores service overrides; the owner's minimum prices still apply", () => {
  // A service override (5x) is a platform rule, not Server II's price.
  assert.equal(quoteForProvider(rules, "dogesms", 50, "telegram", "usa", ngn).customerPriceKobo, 245_000);
  // $0.05 = NGN 70; x3.5 = NGN 245, under the NGN 500 minimum.
  assert.equal(quoteForProvider(rules, "dogesms", 5, "whatsapp", "usa", ngn).customerPriceKobo, 50_000);
  assert.equal(quoteForProvider(rules, "dogesms", 10, "tiktok", "usa", ngn).customerPriceKobo, 75_000);
  assert.equal(quoteForProvider(rules, "dogesms", 10, "whatsapp", "united-kingdom", ngn).customerPriceKobo, 100_000);
});

test("Server I keeps the platform rules exactly", () => {
  for (const [cents, service, country] of [[50, "whatsapp", "usa"], [33, "telegram", "united-kingdom"], [5, "tiktok", "usa"]] as const) {
    for (const currency of [ngn, usd]) {
      assert.deepEqual(
        quoteForProvider(rules, "grizzlysms", cents, service, country, currency),
        quoteForPair(rules, cents, service, country, currency),
      );
    }
  }
});
