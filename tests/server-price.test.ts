import test from "node:test";
import assert from "node:assert/strict";
import { quoteForProvider, quoteForPair, effectiveProviderMultiplier, type MarginRules } from "../src/lib/pricing";
import type { CurrencyConfigEntry } from "../src/lib/currency-config";

const rules: MarginRules = { defaultMultiplier: 3, exclusiveMultiplier: 2, serviceOverrides: new Map([["telegram", 5]]) };
// Platform pricing rate NGN 1,600; market rate NGN 1,400.
const ngn = { code: "NGN", usdRate: 1600, ngnPerUsd: 1400 } as CurrencyConfigEntry;
const usd = { code: "USD", usdRate: 1, ngnPerUsd: 1600 } as CurrencyConfigEntry;

test("Server II is 4x its cost up to 40 cents, in Naira at the market rate, rounded up to NGN 1", () => {
  // $0.33 = NGN 462 at the market rate; x4 = NGN 1,848.
  const cheap = quoteForProvider(rules, "dogesms", 33, "whatsapp", "usa", ngn);
  assert.equal(cheap.providerCostKobo, 46_200);
  assert.equal(cheap.customerPriceKobo, 184_800);
  assert.equal(cheap.multiplier, 4);
  assert.equal(cheap.rule, "provider");
  // $0.50: the first 40 cents at 4x ($1.60), the next 10 at 2.5x ($0.25) = $1.85.
  const q = quoteForProvider(rules, "dogesms", 50, "whatsapp", "usa", ngn);
  assert.equal(q.providerCostKobo, 70_000);
  assert.equal(q.customerPriceKobo, 259_000);
  assert.equal(q.multiplier, 3.7);
  assert.equal(q.rule, "provider");
  // $0.33 = NGN 462; x4 = NGN 1,848.
  assert.equal(quoteForProvider(rules, "dogesms", 33, "whatsapp", "usa", ngn).customerPriceKobo, 184_800);
  // Shown to a dollar wallet at that same market rate: $1.85.
  assert.equal(Math.round((q.customerPriceKobo / 100 / 1400) * 100), 185);
});

test("without a fresh market rate, Naira falls back to the platform rate", () => {
  const q = quoteForProvider(rules, "dogesms", 50, "whatsapp", "usa", { ...ngn, ngnPerUsd: undefined });
  // $0.50 = NGN 800 at the platform rate; x3.7 = NGN 2,960.
  assert.equal(q.customerPriceKobo, 296_000);
});

test("Server II in US dollars, to the cent", () => {
  assert.equal(quoteForProvider(rules, "dogesms", 50, "whatsapp", "usa", usd).customerPriceKobo, 185);
  assert.equal(quoteForProvider(rules, "dogesms", 33, "whatsapp", "usa", usd).customerPriceKobo, 132);
});

test("Server II ignores service overrides; the owner's minimum prices still apply", () => {
  // A service override (5x) is a platform rule, not Server II's price.
  assert.equal(quoteForProvider(rules, "dogesms", 50, "telegram", "usa", ngn).customerPriceKobo, 259_000);
  // $0.05 = NGN 70; x4 = NGN 280, under the NGN 500 minimum.
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

test("Server II price tapers on dearer numbers, never falls as cost rises, and leaves cheap ones alone", () => {
  // Anything up to 40 cents is exactly 4x, as before.
  for (const cents of [1, 5, 10, 25, 33, 40]) assert.equal(effectiveProviderMultiplier("dogesms", cents), 4, `${cents}c`);
  // $1.00 -> $3.10, $2.00 -> $5.25, $5.00 -> $10.25.
  const priced = (cents: number) => Math.round((effectiveProviderMultiplier("dogesms", cents) ?? 0) * cents);
  assert.equal(priced(100), 310);
  assert.equal(priced(200), 525);
  assert.equal(priced(500), 1025);
  // Dearer cost, dearer price; and the multiple only ever falls.
  let previousPrice = 0;
  let previousMultiple = Infinity;
  for (let cents = 1; cents <= 2000; cents += 3) {
    const multiple = effectiveProviderMultiplier("dogesms", cents)!;
    assert.ok(multiple * cents >= previousPrice - 1e-9, `price dropped at ${cents}c`);
    assert.ok(multiple <= previousMultiple + 1e-9, `multiple rose at ${cents}c`);
    assert.ok(multiple >= 1.4 - 1e-9, `below the last tier's multiple at ${cents}c`);
    previousPrice = multiple * cents;
    previousMultiple = multiple;
  }
  // No tiers for the other server.
  assert.equal(effectiveProviderMultiplier("grizzlysms", 100), undefined);
});
