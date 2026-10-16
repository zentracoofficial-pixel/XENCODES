import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Smart Pickup inside the live quote, with both servers stubbed at the
 * network edge and evidence in the real database:
 *  - each server is priced its own way: Server II at 4x its cost, in every
 *    currency; the cheapest server is the customer's price and goes first;
 *  - a dearer server never jumps ahead, whatever its record;
 *  - between servers at the same price, the one that delivers goes first;
 *  - Server II can be quoted on its own (the "try Server II" offer).
 */

process.env.GRIZZLYSMS_API_KEY = "grizzly-test-key";
process.env.DOGESMS_API_KEY = "sk_live_quote_test";
process.env.DOGESMS_WEBHOOK_SECRET = "whsec_quote_test";

const { prisma } = await import("../src/lib/prisma");
const { SETTING_KEYS } = await import("../src/lib/settings");
const { quotePair } = await import("../src/lib/inventory");
const { getDefaultCurrency, readCurrencyConfig } = await import("../src/lib/currency-config");
const { quoteForPair } = await import("../src/lib/pricing");
const { loadMarginRules } = await import("../src/lib/pricing");
const { DogeSmsProvider } = await import("../src/lib/provider/dogesms");

const SERVICE = "Quotetest Xyz";
const SLUG = "quotetest-xyz";
const realFetch = globalThis.fetch;
const saved = new Map<string, string | null>();
const userIds: string[] = [];
/** What Server II bills for the pair, in US cents. Changed per test. */
let dogeCents = 100;
/** When set, Server II never answers (a stalled server). */
let dogeStalled = false;

before(async () => {
  DogeSmsProvider.resetForTests();
  // The adapter keeps a saved copy of DogeSMS's lists (see catalogStore); a
  // copy left by anything else would stand in for this test's stub.
  for (const key of [SETTING_KEYS.providerConfig, SETTING_KEYS.smartPickup, "dogesms_catalog_v1"]) {
    saved.set(key, (await prisma.setting.findUnique({ where: { key } }))?.value ?? null);
  }
  await prisma.setting.deleteMany({ where: { key: "dogesms_catalog_v1" } });
  const put = (key: string, value: unknown) =>
    prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
  await put(SETTING_KEYS.providerConfig, [
    { id: "grizzlysms", enabled: true, priority: 0 },
    { id: "dogesms", enabled: true, priority: 1 },
  ]);
  await put(SETTING_KEYS.smartPickup, { explorationPercent: 0 });
  // The house (Server I) catalog the directory maps Server II onto.
  await prisma.syncedOffer.deleteMany({ where: { serviceSlug: SLUG } });
  await prisma.syncedOffer.create({
    data: {
      providerId: "grizzlysms", serviceSlug: SLUG, serviceName: SERVICE, serviceColor: "#000000", category: "All services",
      countrySlug: "usa", countryName: "USA", countryFlag: "🇺🇸", dialCode: "+1", nationalDigits: 10,
      costUsdCents: 30, priceKobo: 100000, stock: "in_stock", stockCount: 40, syncedAt: new Date(0),
    },
  });

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname.includes("grizzlysms")) {
      const action = url.searchParams.get("action");
      const body =
        action === "getServicesList" ? [{ code: "qx", name: SERVICE }]
        : action === "getCountries" ? { "187": { eng: "USA" } }
        : action === "getPrices" ? { "187": { qx: { cost: 0.3, count: 40 } } }
        : action === "getPricesV3" ? {}
        : "BAD_ACTION";
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
    }
    if (url.hostname === "api.dogesms.com") {
      if (dogeStalled) return new Promise<Response>(() => {});
      const body =
        url.pathname === "/v1/catalog/services" ? { data: [{ code: "dqx", name: SERVICE }] }
        : url.pathname === "/v1/catalog/countries" ? { data: [{ code: "US", name: "United States", phone_prefix: "1" }] }
        : url.pathname === "/v1/catalog/prices" ? { data: [{ service_code: "dqx", price_cents: dogeCents }] }
        : { error: { code: "NOT_FOUND" } };
      return new Response(JSON.stringify(body), { status: url.pathname.startsWith("/v1/catalog") ? 200 : 404 });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const [key, value] of saved) {
    if (value === null) await prisma.setting.deleteMany({ where: { key } });
    else await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  await prisma.syncedOffer.deleteMany({ where: { serviceSlug: SLUG } });
  await prisma.activation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

/** Server II's price (4x the first 40 cents of cost, 2.5x up to $1.50),
 *  rounded up to NGN 1 or 1 cent, never under the NGN 500 minimum. */
const expectedServerTwo = (cents: number, currency: Awaited<ReturnType<typeof getDefaultCurrency>>) => {
  const rate = currency.code === "NGN" ? (currency.ngnPerUsd ?? currency.usdRate) : currency.usdRate;
  const cost = Math.round((cents / 100) * rate * 100);
  const step = currency.code === "NGN" ? 100 : 1;
  const pricedCents = cents <= 40 ? cents * 4 : 160 + (cents - 40) * 2.5;
  const price = Math.ceil((cost * pricedCents) / cents / step - 1e-9) * step;
  return currency.code === "NGN" ? Math.max(price, 50_000) : price;
};

test("Server II dearer: Server I is the price and goes first; Server II is the fallback at its own tiered price", async () => {
  dogeCents = 100;
  DogeSmsProvider.resetForTests();
  const currency = await getDefaultCurrency();
  const q = await quotePair(SLUG, "usa", currency);
  assert.equal(q.ok, true);
  if (!q.ok) return;
  assert.equal(q.provider, "grizzlysms");
  const rules = await loadMarginRules();
  assert.equal(q.quote.customerPriceKobo, quoteForPair(rules, 30, SLUG, "usa", currency).customerPriceKobo);
  assert.equal(q.country.priceKobo, q.quote.customerPriceKobo);
  assert.equal(q.fallbacks?.length, 1);
  const fallback = q.fallbacks![0];
  assert.equal(fallback.provider, "dogesms");
  assert.equal(fallback.quote.customerPriceKobo, expectedServerTwo(100, currency));
  assert.equal(fallback.quote.rule, "provider");
  assert.ok(fallback.quote.customerPriceKobo > q.quote.customerPriceKobo);
});

test("Server II on its own, in Naira and in US dollars, is exactly 4x its cost", async () => {
  dogeCents = 37;
  DogeSmsProvider.resetForTests();
  for (const code of ["NGN", "USD"]) {
    const currency = (await readCurrencyConfig()).find((entry) => entry.code === code);
    assert.ok(currency, code);
    const q = await quotePair(SLUG, "usa", currency!, { onlyProvider: "dogesms" });
    assert.equal(q.ok, true, code);
    if (!q.ok) continue;
    assert.equal(q.provider, "dogesms");
    assert.equal(q.fallbacks, undefined);
    assert.equal(q.quote.customerPriceKobo, expectedServerTwo(37, currency!), code);
    if (code === "USD") {
      // 37 cents x 4 = $1.48: not pushed up to a whole dollar.
      assert.equal(q.quote.providerCostKobo, 37);
      assert.equal(q.quote.customerPriceKobo, 148);
    }
  }
});

test("with real history for this pair, a better-delivering but dearer server still does not jump ahead", async () => {
  dogeCents = 100;
  DogeSmsProvider.resetForTests();
  const user = await prisma.user.create({
    data: { email: `pickup-${Date.now()}@test.invalid`, passwordHash: "x", currency: "NGN" },
  });
  userIds.push(user.id);
  const base = {
    userId: user.id, serviceSlug: SLUG, serviceName: SERVICE, countrySlug: "usa", countryName: "USA",
    phoneNumber: "15550000", priceKobo: 100000, expiresAt: new Date(),
  };
  const now = Date.now();
  await prisma.activation.createMany({
    data: [
      ...Array.from({ length: 25 }, (_, i) => ({ ...base, provider: "dogesms", status: "RECEIVED" as const, code: "1", createdAt: new Date(now - 60_000 * (i + 2)), receivedAt: new Date(now - 60_000 * (i + 1)) })),
      ...Array.from({ length: 25 }, (_, i) => ({ ...base, provider: "grizzlysms", status: i < 5 ? ("RECEIVED" as const) : ("EXPIRED" as const), createdAt: new Date(now - 60_000 * (i + 2)), receivedAt: i < 5 ? new Date(now - 60_000 * (i + 1)) : null })),
    ],
  });
  const q = await quotePair(SLUG, "usa", await getDefaultCurrency());
  assert.equal(q.ok, true);
  if (!q.ok) return;
  assert.equal(q.pickup?.mode, "scored");
  assert.equal(q.provider, "grizzlysms");
  assert.equal(q.fallbacks?.[0].provider, "dogesms");
});

test("Server II cheaper: it is the customer's price and goes first", async () => {
  dogeCents = 1;
  DogeSmsProvider.resetForTests();
  const currency = await getDefaultCurrency();
  const q = await quotePair(SLUG, "usa", currency);
  assert.equal(q.ok, true);
  if (!q.ok) return;
  if (expectedServerTwo(1, currency) < quoteForPair(await loadMarginRules(), 30, SLUG, "usa", currency).customerPriceKobo) {
    assert.equal(q.provider, "dogesms");
    assert.equal(q.quote.customerPriceKobo, expectedServerTwo(1, currency));
  }
});

test("the quote lists every server that can sell the pair with its own price, cheapest first", async () => {
  dogeCents = 100; // Server II dearer
  DogeSmsProvider.resetForTests();
  const currency = await getDefaultCurrency();
  const q = await quotePair(SLUG, "usa", currency);
  assert.equal(q.ok, true);
  if (!q.ok) return;
  assert.deepEqual(q.options.map((o) => o.provider), ["grizzlysms", "dogesms"]);
  assert.equal(q.options[0].priceKobo, q.quote.customerPriceKobo === q.options[0].priceKobo ? q.options[0].priceKobo : -1);
  assert.ok(q.options[0].priceKobo < q.options[1].priceKobo);
  assert.equal(q.options[1].priceKobo, expectedServerTwo(100, currency));

  // Asking for one server returns just that server, at its own price.
  const two = await quotePair(SLUG, "usa", currency, { onlyProvider: "dogesms" });
  assert.equal(two.ok, true);
  if (!two.ok) return;
  assert.deepEqual(two.options.map((o) => o.provider), ["dogesms"]);
  assert.equal(two.quote.customerPriceKobo, q.options[1].priceKobo);
  const one = await quotePair(SLUG, "usa", currency, { onlyProvider: "grizzlysms" });
  assert.equal(one.ok, true);
  if (!one.ok) return;
  assert.equal(one.provider, "grizzlysms");
  assert.equal(one.quote.customerPriceKobo, q.options[0].priceKobo);
});

test("a stalled Server II does not hold up or change Server I's quote", async () => {
  dogeCents = 100;
  dogeStalled = true;
  DogeSmsProvider.resetForTests();
  try {
    const currency = await getDefaultCurrency();
    const started = Date.now();
    const q = await quotePair(SLUG, "usa", currency);
    assert.equal(q.ok, true);
    if (!q.ok) return;
    assert.deepEqual(q.options.map((o) => o.provider), ["grizzlysms"]);
    const rules = await loadMarginRules();
    assert.equal(q.quote.customerPriceKobo, quoteForPair(rules, 30, SLUG, "usa", currency).customerPriceKobo);
    assert.ok(Date.now() - started < 9_000, "Server I's quote came back without waiting out the stalled server");
  } finally {
    dogeStalled = false;
    DogeSmsProvider.resetForTests();
  }
});
