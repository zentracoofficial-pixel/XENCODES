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
      { ...base, serviceSlug: "telegram", serviceName: "Telegram" },
      { ...base, serviceSlug: "bet365", serviceName: "Bet365" },
      { ...base, serviceSlug: "exness", serviceName: "Exness" },
      { ...base, serviceSlug: "onlyfans", serviceName: "OnlyFans" },
      { ...base, serviceSlug: "vivino", serviceName: "Vivino" },
      { ...base, serviceSlug: "binance", serviceName: "Binance" },
      { ...base, serviceSlug: "tinder", serviceName: "Tinder" },
    ],
  });
  const removed = await removeRestrictedOffers();
  assert.ok(removed >= 6);
  const left = (await prisma.syncedOffer.findMany({ where: { providerId: PROVIDER } })).map((r) => r.serviceSlug).sort();
  assert.deepEqual(left, ["telegram", "whatsapp"]);
  assert.equal(await removeRestrictedOffers(), 0);
});
