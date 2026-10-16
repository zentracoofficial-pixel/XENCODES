import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * Smart Pickup inside the live quote, with both servers stubbed at the
 * network edge and evidence in the real database:
 *  - the customer's price is the cheapest server's price, whoever fills it;
 *  - with no history the safe default goes first and the other is the fallback;
 *  - with history, the server that actually delivers for this pair goes first.
 */

process.env.GRIZZLYSMS_API_KEY = "grizzly-test-key";
process.env.DOGESMS_API_KEY = "sk_live_quote_test";
process.env.DOGESMS_WEBHOOK_SECRET = "whsec_quote_test";

const { prisma } = await import("../src/lib/prisma");
const { SETTING_KEYS } = await import("../src/lib/settings");
const { quotePair } = await import("../src/lib/inventory");
const { getDefaultCurrency } = await import("../src/lib/currency-config");
const { DogeSmsProvider } = await import("../src/lib/provider/dogesms");

const SERVICE = "Quotetest Xyz";
const SLUG = "quotetest-xyz";
const realFetch = globalThis.fetch;
const saved = new Map<string, string | null>();
const userIds: string[] = [];

before(async () => {
  DogeSmsProvider.resetForTests();
  for (const key of [SETTING_KEYS.providerConfig, SETTING_KEYS.smartPickup]) {
    saved.set(key, (await prisma.setting.findUnique({ where: { key } }))?.value ?? null);
  }
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
      const body =
        url.pathname === "/v1/catalog/services" ? { data: [{ code: "dqx", name: SERVICE }] }
        : url.pathname === "/v1/catalog/countries" ? { data: [{ code: "US", name: "United States", phone_prefix: "1" }] }
        : url.pathname === "/v1/catalog/prices" ? { data: [{ service_code: "dqx", price_cents: 20 }] }
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
    else await prisma.setting.update({ where: { key }, data: { value } });
  }
  await prisma.syncedOffer.deleteMany({ where: { serviceSlug: SLUG } });
  await prisma.activation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test("no history: the safe default fills the order, the other server is the fallback, and the price is the cheapest server's", async () => {
  const currency = await getDefaultCurrency();
  const q = await quotePair(SLUG, "usa", currency);
  assert.equal(q.ok, true);
  if (!q.ok) return;
  assert.equal(q.provider, "grizzlysms");
  assert.equal(q.pickup?.mode, "default");
  assert.equal(q.fallbacks?.length, 1);
  const fallback = q.fallbacks![0];
  assert.equal(fallback.provider, "dogesms");
  // One price, whoever fills it, and a profit either way.
  assert.equal(q.quote.customerPriceKobo, fallback.quote.customerPriceKobo);
  assert.equal(q.country.priceKobo, q.quote.customerPriceKobo);
  assert.ok(q.quote.grossProfitKobo > 0 && fallback.quote.grossProfitKobo > 0);
  // Each order records its own server's cost.
  assert.ok(q.quote.providerCostKobo > fallback.quote.providerCostKobo);
});

test("with real history for this pair, the server that delivers goes first", async () => {
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
  assert.equal(q.provider, "dogesms");
  assert.equal(q.fallbacks?.[0].provider, "grizzlysms");
});
