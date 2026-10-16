import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * A service blocked on one server is blocked on the other under any spelling
 * of its name, through the settings row both servers share.
 */

process.env.GRIZZLYSMS_API_KEY = "grizzly-test-key";

const { prisma } = await import("../src/lib/prisma");
const { settingsLearnedRestricted } = await import("../src/lib/restricted-learned");
const { compactName } = await import("../src/lib/restricted-services");
const { GrizzlySmsProvider } = await import("../src/lib/provider/grizzlysms");

const KEY = "restricted_names_v1";
let saved: string | null = null;
const realFetch = globalThis.fetch;

before(async () => {
  saved = (await prisma.setting.findUnique({ where: { key: KEY } }))?.value ?? null;
  await prisma.setting.deleteMany({ where: { key: KEY } });
});

after(async () => {
  globalThis.fetch = realFetch;
  if (saved === null) await prisma.setting.deleteMany({ where: { key: KEY } });
  else await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: saved }, update: { value: saved } });
  await prisma.$disconnect();
});

test("each server reads what the others blocked, never its own list", async () => {
  await settingsLearnedRestricted.write("dogesms", [{ name: "Zorbo Club", category: "gambling", term: "test" }]);
  await settingsLearnedRestricted.write("grizzlysms", [{ name: "Kissly", category: "dating", term: "test" }]);
  const forGrizzly = await settingsLearnedRestricted.readOthers("grizzlysms");
  assert.deepEqual([...forGrizzly.keys()], ["zorboclub"]);
  const forDoge = await settingsLearnedRestricted.readOthers("dogesms");
  assert.deepEqual([...forDoge.keys()], ["kissly"]);
  assert.equal(compactName("Zorbo-Club"), "zorboclub");
});

test("Server I follows a service Server II blocked, under another spelling", async () => {
  await settingsLearnedRestricted.write("dogesms", [{ name: "Zorbo Club", category: "gambling", term: "test" }]);
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    if (!url.hostname.includes("grizzlysms")) return realFetch(input as RequestInfo);
    const action = url.searchParams.get("action");
    const body =
      action === "getServicesList" ? JSON.stringify([{ code: "wa", name: "WhatsApp" }, { code: "zc", name: "Zorbo-Club" }])
      : action === "getCountries" ? JSON.stringify({ "187": { eng: "USA" } })
      : action === "getPrices" ? JSON.stringify({ "187": { wa: { cost: 0.5, count: 5 }, zc: { cost: 0.5, count: 5 } } })
      : "{}";
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  const provider = new GrizzlySmsProvider({ apiKey: "k", restrictedStore: settingsLearnedRestricted });
  const slugs = (await provider.getServices()).map((s) => s.slug);
  assert.ok(slugs.includes("whatsapp"));
  assert.ok(!slugs.includes("zorbo-club"));
  assert.deepEqual((await provider.listBlockedServices()).map((b) => b.name), ["Zorbo-Club"]);
});
