import test, { after, before } from "node:test";
import assert from "node:assert/strict";

/**
 * Browsing by country: the services on sale in one country, each at the
 * lowest price any enabled server sells it for, priced by the same engine as
 * every other price; switched-off servers, switched-off services and
 * restricted services never appear; no price is ever zero.
 */

const { prisma } = await import("../src/lib/prisma");
const { SETTING_KEYS } = await import("../src/lib/settings");
const { getCountryCatalog, getCountryServices } = await import("../src/lib/inventory");
const { getDefaultCurrency } = await import("../src/lib/currency-config");
const { loadMarginRules, quoteForPair, quoteForProvider } = await import("../src/lib/pricing");

const C = "zz-testland";
const saved = new Map<string, string | null>();

async function offer(providerId: string, serviceSlug: string, serviceName: string, cents: number, country = C) {
  await prisma.syncedOffer.create({
    data: {
      providerId, serviceSlug, serviceName, serviceColor: "#000000", category: "All services",
      countrySlug: country, countryName: "Testland", countryFlag: "🏳️", dialCode: "+999", nationalDigits: 9,
      costUsdCents: cents, priceKobo: 1, stock: "in_stock", stockCount: 40, syncedAt: new Date(),
    },
  });
}

before(async () => {
  for (const key of [SETTING_KEYS.providerConfig]) {
    saved.set(key, (await prisma.setting.findUnique({ where: { key } }))?.value ?? null);
  }
  const config = JSON.stringify([
    { id: "grizzlysms", enabled: true, priority: 0 },
    { id: "dogesms", enabled: true, priority: 1 },
    { id: "offtest", enabled: false, priority: 2 },
  ]);
  await prisma.setting.upsert({ where: { key: SETTING_KEYS.providerConfig }, create: { key: SETTING_KEYS.providerConfig, value: config }, update: { value: config } });
  await prisma.syncedOffer.deleteMany({ where: { countrySlug: C } });
  await prisma.serviceSetting.upsert({ where: { slug: "cc-switched-off" }, create: { slug: "cc-switched-off", enabled: false }, update: { enabled: false } });
  await offer("grizzlysms", "cc-alpha", "Ccalpha", 30); // Server I cheaper
  await offer("dogesms", "cc-alpha", "Ccalpha", 30);
  await offer("dogesms", "cc-beta", "Ccbeta", 20); // Server II only
  await offer("offtest", "cc-gamma", "Ccgamma", 5); // switched-off server
  await offer("grizzlysms", "cc-switched-off", "Ccswitched", 30); // switched-off service
  await offer("grizzlysms", "cc-casino", "Casino Royale Bet", 30); // restricted
});

after(async () => {
  await prisma.syncedOffer.deleteMany({ where: { countrySlug: C } });
  await prisma.serviceSetting.deleteMany({ where: { slug: "cc-switched-off" } });
  for (const [key, value] of saved) {
    if (value === null) await prisma.setting.deleteMany({ where: { key } });
    else await prisma.setting.update({ where: { key }, data: { value } });
  }
  await prisma.$disconnect();
});

test("a country's services: cheapest server's price, Server II at its own price, nothing hidden shown", async () => {
  const currency = await getDefaultCurrency();
  const rules = await loadMarginRules();
  const result = await getCountryServices(C, currency);
  assert.ok(result);
  const bySlug = new Map(result!.services.map((s) => [s.slug, s]));
  assert.deepEqual([...bySlug.keys()].sort(), ["cc-alpha", "cc-beta"]);
  const serverI = quoteForPair(rules, 30, "cc-alpha", C, currency).customerPriceKobo;
  const serverII = quoteForProvider(rules, "dogesms", 30, "cc-alpha", C, currency).customerPriceKobo;
  assert.equal(bySlug.get("cc-alpha")!.fromPriceKobo, Math.min(serverI, serverII));
  assert.equal(bySlug.get("cc-beta")!.fromPriceKobo, quoteForProvider(rules, "dogesms", 20, "cc-beta", C, currency).customerPriceKobo);
  for (const s of result!.services) assert.ok(s.fromPriceKobo > 0);
  // Nothing about suppliers or costs reaches the customer.
  assert.doesNotMatch(JSON.stringify(result), /grizzly|dogesms|costUsdCents|providerId/i);
});

test("the country list counts only what can be bought", async () => {
  const testland = (await getCountryCatalog()).find((c) => c.slug === C);
  assert.ok(testland);
  assert.equal(testland!.serviceCount, 2);
});

test("an unknown country is not offered", async () => {
  assert.equal(await getCountryServices("zz-nowhere", await getDefaultCurrency()), null);
});
