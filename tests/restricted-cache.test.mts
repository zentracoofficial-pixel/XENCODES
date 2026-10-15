import test, { after } from "node:test";
import assert from "node:assert/strict";

const { prisma } = await import("../src/lib/prisma");
const { removeRestrictedOffers } = await import("../src/lib/provider-sync");

const PROVIDER = "test-restricted-cache";
const base = {
  providerId: PROVIDER,
  serviceColor: "#000000",
  category: "All services",
  countrySlug: "usa",
  countryName: "USA",
  countryFlag: "US",
  dialCode: "+1",
  nationalDigits: 10,
  costUsdCents: 50,
  priceKobo: 100_000,
  stock: "in_stock",
  stockCount: 10,
};

after(async () => {
  await prisma.syncedOffer.deleteMany({ where: { providerId: PROVIDER } });
  await prisma.$disconnect();
});

test("cached offers for restricted services are purged, others are kept", async () => {
  await prisma.syncedOffer.deleteMany({ where: { providerId: PROVIDER } });
  await prisma.syncedOffer.createMany({
    data: [
      { ...base, serviceSlug: "whatsapp", serviceName: "WhatsApp" },
      { ...base, serviceSlug: "betterment", serviceName: "Betterment" },
      { ...base, serviceSlug: "bet365", serviceName: "Bet365" },
      { ...base, serviceSlug: "exness", serviceName: "Exness" },
      { ...base, serviceSlug: "onlyfans", serviceName: "OnlyFans" },
      { ...base, serviceSlug: "vivino", serviceName: "Vivino" },
    ],
  });
  const removed = await removeRestrictedOffers();
  assert.ok(removed >= 4);
  const left = (await prisma.syncedOffer.findMany({ where: { providerId: PROVIDER } })).map((r) => r.serviceSlug).sort();
  assert.deepEqual(left, ["betterment", "whatsapp"]);
  assert.equal(await removeRestrictedOffers(), 0);
});
