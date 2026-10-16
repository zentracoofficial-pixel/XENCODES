import test, { before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * The pages built for search engines, against the real database: a page is
 * only offered where there is something real to say, restricted services
 * never appear, and the sitemaps list exactly those pages.
 */

process.env.GRIZZLYSMS_API_KEY = "grizzly-test-key";

const { prisma } = await import("../src/lib/prisma");
const { SETTING_KEYS } = await import("../src/lib/settings");
const { getSeoIndex, resetSeoIndexForTests } = await import("../src/lib/seo-catalog");
const { buildSitemap, buildSitemapIndex } = await import("../src/lib/sitemap-xml");
const { getServiceCountryOffers } = await import("../src/lib/inventory");
const { getDefaultCurrency } = await import("../src/lib/currency-config");

const TAG = "seotest";
const services = ["a", "b", "c", "d", "e", "f"].map((id) => ({ slug: `${TAG}-svc-${id}`, name: `Seotest Svc ${id.toUpperCase()}` }));
const countries = [1, 2, 3, 4, 5, 6].map((n) => ({ slug: `${TAG}-ctry-${n}`, name: `Seotestland ${n}`, dial: `+9${n}` }));
const saved = new Map<string, string | null>();

function row(service: { slug: string; name: string }, country: { slug: string; name: string; dial: string }, providerId = "grizzlysms") {
  return {
    providerId,
    serviceSlug: service.slug,
    serviceName: service.name,
    serviceColor: "#000000",
    category: "All services",
    countrySlug: country.slug,
    countryName: country.name,
    countryFlag: "🌍",
    dialCode: country.dial,
    nationalDigits: 9,
    costUsdCents: 40,
    priceKobo: 100000,
    stock: "in_stock",
    stockCount: 12,
    syncedAt: new Date(),
  };
}

before(async () => {
  saved.set(SETTING_KEYS.providerConfig, (await prisma.setting.findUnique({ where: { key: SETTING_KEYS.providerConfig } }))?.value ?? null);
  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.providerConfig },
    create: { key: SETTING_KEYS.providerConfig, value: JSON.stringify([{ id: "grizzlysms", enabled: true, priority: 0 }]) },
    update: { value: JSON.stringify([{ id: "grizzlysms", enabled: true, priority: 0 }]) },
  });
  await prisma.syncedOffer.deleteMany({ where: { serviceSlug: { startsWith: TAG } } });
  const rows = [];
  // Services a-e sell in all six countries; f sells in only two (under the page threshold).
  for (const service of services.slice(0, 5)) for (const country of countries) rows.push(row(service, country));
  for (const country of countries.slice(0, 2)) rows.push(row(services[5], country));
  // A restricted service sold everywhere.
  const restricted = { slug: `${TAG}-bet365`, name: "Bet365" };
  for (const country of countries) rows.push(row(restricted, country));
  await prisma.syncedOffer.createMany({ data: rows });
  resetSeoIndexForTests();
});

after(async () => {
  await prisma.syncedOffer.deleteMany({ where: { serviceSlug: { startsWith: TAG } } });
  for (const [key, value] of saved) {
    if (value === null) await prisma.setting.deleteMany({ where: { key } });
    else await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  resetSeoIndexForTests();
  await prisma.$disconnect();
});

test("pages exist only where there is enough to say, and a restricted service never gets one", async () => {
  const index = await getSeoIndex();
  const slugs = index.services.map((service) => service.slug);
  for (const service of services.slice(0, 5)) assert.ok(slugs.includes(service.slug), `${service.slug} has a page`);
  assert.ok(!slugs.includes(services[5].slug), "two countries is under the threshold");
  assert.ok(!slugs.includes(`${TAG}-bet365`), "restricted services are never listed");

  const countrySlugs = index.countries.map((country) => country.slug);
  for (const country of countries) assert.ok(countrySlugs.includes(country.slug), `${country.slug} has a page`);

  const pairs = index.pairs.filter((pair) => pair.service.startsWith(TAG));
  assert.equal(pairs.length, 5 * 6);
  assert.ok(!pairs.some((pair) => pair.service === `${TAG}-bet365` || pair.service === services[5].slug));
});

test("the sitemap index points at the core file and one file per 5,000 service-in-country pages", async () => {
  const xml = await buildSitemapIndex();
  assert.match(xml, /<sitemapindex/);
  assert.match(xml, /\/sitemaps\/core\.xml/);
  assert.match(xml, /\/sitemaps\/pairs-1\.xml/);
});

test("the core sitemap lists services, countries and guides; the pairs sitemap lists the pages", async () => {
  const core = (await buildSitemap("core.xml"))!;
  assert.match(core, /<loc>https:\/\/[^<]+\/guides\/what-is-a-virtual-phone-number<\/loc>/);
  assert.match(core, new RegExp(`/services/${TAG}-svc-a<`));
  assert.match(core, new RegExp(`/countries/${TAG}-ctry-1<`));
  assert.doesNotMatch(core, /bet365/);
  assert.doesNotMatch(core, new RegExp(`/services/${TAG}-svc-f<`));

  const all = [];
  for (let page = 1; ; page += 1) {
    const xml = await buildSitemap(`pairs-${page}.xml`);
    if (!xml) break;
    all.push(xml);
  }
  const joined = all.join("");
  assert.match(joined, new RegExp(`/services/${TAG}-svc-a/${TAG}-ctry-1<`));
  assert.doesNotMatch(joined, /bet365/);
  assert.equal(await buildSitemap("nonsense.xml"), null);
  assert.equal(await buildSitemap("pairs-0.xml"), null);
});

test("a service's countries come from the synced catalog, one price per country, repeat listings left out", async () => {
  await prisma.syncedOffer.create({ data: { ...row(services[0], { slug: `${TAG}-ctry-1-2`, name: "Seotestland 1 (2)", dial: "+91" }) } });
  try {
    const result = await getServiceCountryOffers(services[0].slug, await getDefaultCurrency());
    assert.ok(result);
    assert.equal(result!.countries.length, 6);
    assert.ok(result!.countries.every((country) => country.fromPriceKobo > 0));
    assert.ok(!result!.countries.some((country) => country.name.includes("(2)") || country.slug === `${TAG}-ctry-1-2`));
    assert.equal(result!.countries[0].stockCount, 12);
  } finally {
    await prisma.syncedOffer.deleteMany({ where: { countrySlug: `${TAG}-ctry-1-2` } });
  }
  assert.equal(await getServiceCountryOffers(`${TAG}-bet365`, await getDefaultCurrency()), null);
});
