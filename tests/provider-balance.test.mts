import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * Balance monitoring against the real database with fake servers: a reading
 * is recorded per server, a recent one can be reused without asking the
 * supplier again, and a failed check keeps the last good reading.
 */

const { prisma } = await import("../src/lib/prisma");
const { checkProviderBalance, getProviderBalanceStatus } = await import("../src/lib/provider-balance-monitor");
type Provider = import("../src/lib/provider/types").NumberProvider;

const ID = "balancetest";

function fake(getBalance: () => Promise<number | null>): Provider {
  return { id: ID, label: "Balancetest", getProviderBalanceUsdCents: getBalance } as unknown as Provider;
}

beforeEach(async () => {
  await prisma.providerBalanceStatus.deleteMany({ where: { id: ID } });
});

after(async () => {
  await prisma.providerBalanceStatus.deleteMany({ where: { id: ID } });
  await prisma.$disconnect();
});

test("a reading is recorded for the server", async () => {
  const result = await checkProviderBalance(ID, "Balancetest", fake(async () => 5_000));
  assert.deepEqual([result.ok, result.balanceUsdCents], [true, 5_000]);
  const status = await getProviderBalanceStatus(ID);
  assert.equal(status?.currentBalanceUsdCents, 5_000);
  assert.equal(status?.state, "HEALTHY");
});

test("a recent reading is reused when allowed, and a fresh one is read when not", async () => {
  await checkProviderBalance(ID, "Balancetest", fake(async () => 5_000));
  let asked = 0;
  const counting = fake(async () => {
    asked += 1;
    return 4_000;
  });
  const reused = await checkProviderBalance(ID, "Balancetest", counting, { maxAgeMs: 60_000 });
  assert.equal(reused.balanceUsdCents, 5_000);
  assert.equal(asked, 0);
  const fresh = await checkProviderBalance(ID, "Balancetest", counting);
  assert.equal(fresh.balanceUsdCents, 4_000);
  assert.equal(asked, 1);
});

test("a failed check keeps the last good reading and is reported as failed", async () => {
  await checkProviderBalance(ID, "Balancetest", fake(async () => 5_000));
  const failed = await checkProviderBalance(ID, "Balancetest", fake(async () => {
    throw new Error("DogeSMS GET /v1/balance: HTTP 429 RATE_LIMITED");
  }));
  assert.equal(failed.ok, false);
  const status = await getProviderBalanceStatus(ID);
  assert.equal(status?.currentBalanceUsdCents, 5_000);
  assert.equal(status?.state, "BALANCE_CHECK_FAILED");
  // The next good check clears the failure.
  await checkProviderBalance(ID, "Balancetest", fake(async () => 4_500));
  assert.equal((await getProviderBalanceStatus(ID))?.state, "HEALTHY");
});
