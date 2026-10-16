import test from "node:test";
import assert from "node:assert/strict";
import { runPurchaseCascade, type CascadeQuote, type AttemptResult } from "../src/lib/purchase-cascade";
import type { PriceQuote } from "../src/lib/pricing";
import { ProviderError } from "../src/lib/provider/types";

const price = (kobo: number) => ({ customerPriceKobo: kobo, providerCostKobo: kobo / 2 }) as PriceQuote;
const rung = (offer: string | undefined, kobo = 1000) => ({ providerOfferId: offer, costUsdCents: 30, quote: price(kobo) });

interface Q extends CascadeQuote {
  fallbacks?: Q[];
}
const quote = (provider: string, rungs: ReturnType<typeof rung>[], fallbacks: Q[] = []): Q => ({ provider, ladder: rungs, fallbacks });
const number = (id: string) => ({ providerOrderId: id, phoneNumber: "15550001", sessionSeconds: 600 });

async function run(initial: Q, script: (q: Q, offer: string | undefined) => AttemptResult | Error) {
  const calls: string[] = [];
  const result = await runPurchaseCascade<Q>({
    initial,
    ceilingKobo: 1000,
    balanceKobo: 5000,
    requote: async () => null,
    attempt: async (q, r) => {
      calls.push(`${q.provider}:${r.providerOfferId ?? "-"}`);
      const out = script(q, r.providerOfferId);
      if (out instanceof Error) throw out;
      return out;
    },
  });
  return { result, calls };
}

test("Smart Pickup's first choice sells: nobody else is asked", async () => {
  const { result, calls } = await run(quote("dogesms", [rung(undefined)], [quote("grizzlysms", [rung("p1")])]), () => number("d1"));
  assert.equal(result.success?.quoted.provider, "dogesms");
  assert.deepEqual(calls, ["dogesms:-"]);
});

test("first choice has no numbers: the next provider sells, at the same price", async () => {
  const { result, calls } = await run(
    quote("dogesms", [rung(undefined)], [quote("grizzlysms", [rung("p1"), rung("p2")])]),
    (q, offer) => (q.provider === "grizzlysms" && offer === "p2" ? number("g2") : null),
  );
  assert.deepEqual(calls, ["dogesms:-", "grizzlysms:p1", "grizzlysms:p2"]);
  assert.equal(result.success?.quoted.provider, "grizzlysms");
  assert.equal(result.success?.quote.customerPriceKobo, 1000);
});

test("a refused provider is skipped for the rest of the order, not retried rung by rung", async () => {
  const { result, calls } = await run(
    quote("grizzlysms", [rung("p1"), rung("p2"), rung("p3")], [quote("dogesms", [rung(undefined)])]),
    (q) => (q.provider === "grizzlysms" ? "skip_provider" : number("d1")),
  );
  assert.deepEqual(calls, ["grizzlysms:p1", "dogesms:-"]);
  assert.equal(result.success?.quoted.provider, "dogesms");
});

test("an unknown outcome stops everything: never a second number elsewhere", async () => {
  await assert.rejects(
    run(quote("dogesms", [rung(undefined)], [quote("grizzlysms", [rung("p1")])]), (q) =>
      q.provider === "dogesms" ? new ProviderError("timed out", "network") : number("g1"),
    ),
    /timed out/,
  );
});

test("nobody can sell: nothing bought, every provider tried once", async () => {
  const { result, calls } = await run(quote("dogesms", [rung(undefined)], [quote("grizzlysms", [rung("p1")])]), () => null);
  assert.equal(result.success, undefined);
  assert.deepEqual(calls, ["dogesms:-", "grizzlysms:p1"]);
});

test("dearer rungs are offered for confirmation rather than bought", async () => {
  const { result, calls } = await run(quote("grizzlysms", [rung("p1"), rung("p2", 1400)]), () => null);
  assert.deepEqual(calls, ["grizzlysms:p1"]);
  assert.equal(result.dearerPriceKobo, 1400);
});
