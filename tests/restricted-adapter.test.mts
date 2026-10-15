import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * The real GrizzlySMS adapter against a stubbed supplier that offers and
 * prices restricted services (betting, forex, adult, vaping, wine) next to
 * ordinary ones. None of the restricted ones may be listed, found, quoted,
 * priced in the catalog or bought, while every ordinary service still works.
 */

const { GrizzlySmsProvider } = await import("../src/lib/provider/grizzlysms");

const SERVICES = [
  { code: "wa", name: "WhatsApp" },
  { code: "tg", name: "Telegram" },
  { code: "ig", name: "Instagram" },
  { code: "bt", name: "Bet365" },
  { code: "fx", name: "Exness" },
  { code: "xv", name: "Pornhub" },
  { code: "vp", name: "Vape Shop" },
  { code: "wn", name: "Vivino" },
  { code: "bm", name: "Betterment" },
];

// country id -> service code -> price
const PRICES: Record<string, Record<string, { cost: number; count: number }>> = {
  "187": Object.fromEntries(SERVICES.map((s) => [s.code, { cost: 0.5, count: 40 }])),
  "16": Object.fromEntries(SERVICES.map((s) => [s.code, { cost: 0.7, count: 20 }])),
};
const COUNTRIES = { "187": { eng: "USA" }, "16": { eng: "United Kingdom" } };

const realFetch = globalThis.fetch;
const purchases: string[] = [];

before(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    if (!url.hostname.includes("grizzlysms")) return realFetch(input as RequestInfo);
    const action = url.searchParams.get("action");
    const body =
      action === "getServicesList"
        ? JSON.stringify(SERVICES)
        : action === "getCountries"
          ? JSON.stringify(COUNTRIES)
          : action === "getPrices"
            ? JSON.stringify(PRICES)
            : action === "getNumberV2"
              ? (purchases.push(url.searchParams.get("service") ?? ""), "NO_NUMBERS")
              : action === "getPricesV3"
                ? "{}"
                : "BAD_ACTION";
    return new Response(body, { status: 200 });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
});

const provider = () => new GrizzlySmsProvider({ apiKey: "test-key" });

test("restricted services are never listed", async () => {
  const names = (await provider().getServices()).map((s) => s.name);
  assert.deepEqual(names.sort(), ["Betterment", "Instagram", "Telegram", "WhatsApp"]);
});

test("what was held back is reported with its category, for the admin", async () => {
  const p = provider();
  await p.getServices();
  const blocked = p.getBlockedServices().map((b) => [b.name, b.category]);
  assert.deepEqual(blocked.sort(), [
    ["Bet365", "gambling"],
    ["Exness", "forex"],
    ["Pornhub", "adult"],
    ["Vape Shop", "tobacco"],
    ["Vivino", "alcohol"],
  ].sort());
});

test("restricted services are not in the full catalog the sync caches", async () => {
  const catalog = await provider().getFullCatalog();
  const names = new Set(catalog.map((entry) => entry.service.name));
  assert.deepEqual([...names].sort(), ["Betterment", "Instagram", "Telegram", "WhatsApp"]);
});

test("restricted services have no countries, no availability and no price", async () => {
  const p = provider();
  assert.deepEqual(await p.getCountries("bet365"), []);
  assert.equal(await p.getAvailability("bet365", "usa"), null);
  assert.equal(await p.getAvailability("pornhub", "usa"), null);
  const cheapest = await p.getCheapestCostByService!();
  assert.equal(cheapest.has("bet365"), false);
  assert.equal(cheapest.has("exness"), false);
  assert.equal(cheapest.has("whatsapp"), true);
});

test("a restricted service can never be bought, and the supplier is never asked", async () => {
  purchases.length = 0;
  const p = provider();
  for (const slug of ["bet365", "exness", "pornhub", "vape-shop", "vivino"]) {
    await assert.rejects(() => p.purchaseNumber(slug, "usa"), /Unknown service or country/, slug);
  }
  assert.deepEqual(purchases, []);
});

test("ordinary services are unaffected", async () => {
  const p = provider();
  const countries = await p.getCountries("whatsapp");
  assert.ok(countries.length >= 1);
  assert.ok((await p.getAvailability("betterment", "usa")) !== null);
});
