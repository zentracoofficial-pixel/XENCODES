import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * Sync orchestration against the real database with fake servers:
 *  - a partial read refreshes only what it read and keeps everything else;
 *  - a failed read changes nothing and is recorded as failed;
 *  - a second sync while one runs is refused (skipped), changing nothing;
 *  - a whole-catalog answer far smaller than last time removes nothing;
 *  - Sync all reports full, partial and failed correctly.
 */

const { prisma } = await import("../src/lib/prisma");
const { syncOneProvider, summarize } = await import("../src/lib/provider-sync");
const { isRestrictedService } = await import("../src/lib/restricted-services");
type Provider = import("../src/lib/provider/types").NumberProvider;
type Entry = import("../src/lib/provider/types").ProviderCatalogEntry;

const ID = "synctest";
const svc = (slug: string) => ({ slug, name: `Synctest ${slug}`, color: "#000000", category: "All services" });
const country = (slug: string) => ({ slug, name: slug.toUpperCase(), flag: "🏳️", dialCode: "+1", nationalDigits: 10 });
const entry = (service: string, c: string, cents: number): Entry => ({ service: svc(service), country: country(c), costUsdCents: cents, stock: "in_stock", stockCount: 50 });

function fake(over: Partial<Provider>): Provider {
  return {
    id: ID,
    label: "Synctest",
    getServices: async () => [],
    getCountries: async () => [],
    getAvailability: async () => null,
    purchaseNumber: async () => { throw new Error("not used"); },
    getOrderStatus: async () => { throw new Error("not used"); },
    cancelOrder: async () => {},
    ...over,
  } as Provider;
}

async function seed(rows: Array<[string, string, number]>, at = new Date(Date.now() - 86_400_000)) {
  for (const [service, c, cents] of rows) {
    await prisma.syncedOffer.create({
      data: {
        providerId: ID, serviceSlug: `st-${service}`, serviceName: `Synctest ${service}`, serviceColor: "#000000", category: "All services",
        countrySlug: c, countryName: c.toUpperCase(), countryFlag: "🏳️", dialCode: "+1", nationalDigits: 10,
        costUsdCents: cents, priceKobo: 1, stock: "in_stock", stockCount: 50, syncedAt: at,
      },
    });
  }
}
const rowsNow = () =>
  prisma.syncedOffer.findMany({ where: { providerId: ID }, orderBy: [{ countrySlug: "asc" }, { serviceSlug: "asc" }] });

beforeEach(async () => {
  await prisma.syncedOffer.deleteMany({ where: { providerId: ID } });
  await prisma.providerSyncRun.deleteMany({ where: { providerId: ID } });
  await prisma.providerSyncStatus.deleteMany({ where: { id: ID } });
});

after(async () => {
  await prisma.syncedOffer.deleteMany({ where: { providerId: ID } });
  await prisma.providerSyncRun.deleteMany({ where: { providerId: ID } });
  await prisma.providerSyncStatus.deleteMany({ where: { id: ID } });
  await prisma.$disconnect();
});

test("a partial read refreshes only the countries it read; the rest keep their rows", async () => {
  await seed([["a", "aa", 10], ["b", "aa", 10], ["a", "bb", 20]]);
  const provider = fake({
    getCatalogSnapshot: async () => ({
      entries: [entry("st-a", "aa", 15)],
      countriesRead: ["aa"],
      countriesFailed: [],
      countriesTotal: 2,
      rateLimited: true,
    }),
  });
  const outcome = await syncOneProvider(ID, "Synctest", provider, "manual", Date.now() + 5_000);
  assert.equal(outcome.result, "partial");
  assert.equal(outcome.countriesRead, 1);
  assert.equal(outcome.countriesTotal, 2);
  assert.match(outcome.message ?? "", /1 of 2 countries/);
  const rows = await rowsNow();
  // aa: st-a updated, st-b gone (no longer sold there); bb untouched.
  assert.deepEqual(rows.map((r) => [r.serviceSlug, r.countrySlug, r.costUsdCents]), [["st-a", "aa", 15], ["st-a", "bb", 20]]);
  const status = await prisma.providerSyncStatus.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(status.runningSince, null);
  assert.equal(status.lastResult, "partial");
  assert.equal(status.lastSuccessAt, null, "a partial run is not a full sync");
  const runs = await prisma.providerSyncRun.findMany({ where: { providerId: ID } });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].result, "partial");
  assert.equal(runs[0].countriesRead, 1);
});

test("a failed read changes nothing and is recorded as failed", async () => {
  await seed([["a", "aa", 10]]);
  const provider = fake({ getFullCatalog: async () => { throw new Error("upstream 500 at https://api.example.test/x?api_key=SECRET"); } });
  const outcome = await syncOneProvider(ID, "Synctest", provider, "manual_all", Date.now() + 5_000);
  assert.equal(outcome.result, "failed");
  assert.doesNotMatch(outcome.message ?? "", /SECRET|https?:/, "no URL or key reaches the admin");
  assert.equal((await rowsNow()).length, 1);
  const status = await prisma.providerSyncStatus.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(status.lastResult, "failed");
  assert.equal(status.runningSince, null);
  assert.ok(status.lastFailureAt);
});

test("a second sync while one is running is refused and changes nothing", async () => {
  await seed([["a", "aa", 10]]);
  await prisma.providerSyncStatus.create({ data: { id: ID, runningSince: new Date() } });
  let read = false;
  const provider = fake({ getFullCatalog: async () => { read = true; return [entry("st-a", "aa", 99)]; } });
  const outcome = await syncOneProvider(ID, "Synctest", provider, "manual", Date.now() + 5_000);
  assert.equal(outcome.result, "skipped");
  assert.equal(read, false);
  assert.equal((await rowsNow())[0].costUsdCents, 10);
});

test("a lock left by a run that died long ago does not block a new sync", async () => {
  await prisma.providerSyncStatus.create({ data: { id: ID, runningSince: new Date(Date.now() - 60 * 60 * 1000) } });
  const provider = fake({ getFullCatalog: async () => [entry("st-a", "aa", 12)] });
  const outcome = await syncOneProvider(ID, "Synctest", provider, "cron", Date.now() + 5_000);
  assert.equal(outcome.result, "success");
  const status = await prisma.providerSyncStatus.findUniqueOrThrow({ where: { id: ID } });
  assert.ok(status.lastSuccessAt);
  assert.equal(status.runningSince, null);
});

test("a full answer far smaller than last time writes what came back but removes nothing", async () => {
  // Letter names only: some numbers are names of restricted brands.
  const name = (i: number) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
  const many = Array.from({ length: 260 }, (_, i): [string, string, number] => [`n${name(i)}`, "aa", 10])
    .filter(([slug]) => !isRestrictedService(`st-${slug}`, `Synctest ${slug}`))
    .slice(0, 250);
  await seed(many);
  await prisma.providerSyncStatus.create({ data: { id: ID, offersSynced: 250 } });
  const provider = fake({ getFullCatalog: async () => [entry("st-naa", "aa", 11)] });
  const outcome = await syncOneProvider(ID, "Synctest", provider, "manual", Date.now() + 5_000);
  assert.equal(outcome.result, "partial");
  assert.equal((await rowsNow()).length, 250);
});

test("running the same sync twice does not duplicate rows", async () => {
  const provider = fake({ getFullCatalog: async () => [entry("st-a", "aa", 12), entry("st-b", "aa", 13)] });
  await syncOneProvider(ID, "Synctest", provider, "manual", Date.now() + 5_000);
  await syncOneProvider(ID, "Synctest", provider, "manual", Date.now() + 5_000);
  assert.equal((await rowsNow()).length, 2);
});

test("Sync all: every server's result is reported, and the overall result follows them", () => {
  const ok = { id: "a", label: "A", ok: true, result: "success" as const };
  const part = { id: "b", label: "B", ok: true, result: "partial" as const, message: "1 of 2 countries" };
  const bad = { id: "c", label: "C", ok: false, result: "failed" as const, error: "down" };
  assert.equal(summarize([ok, { ...ok, id: "d" }]).result, "success");
  assert.equal(summarize([ok, bad]).result, "partial");
  assert.equal(summarize([part]).result, "partial");
  assert.equal(summarize([bad, { ...bad, id: "e" }]).result, "failed");
  const mixed = summarize([ok, bad]);
  assert.equal(mixed.providers?.length, 2);
  assert.match(mixed.error ?? "", /C: down/);
});
