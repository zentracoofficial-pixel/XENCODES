import test from "node:test";
import assert from "node:assert/strict";
import {
  rankProviders,
  parseSmartPickupSettings,
  deliveryEstimate,
  DEFAULT_SMART_PICKUP,
  NO_EVIDENCE,
  type ProviderEvidence,
  type PickupCandidate,
} from "../src/lib/smart-pickup";

const S = DEFAULT_SMART_PICKUP;

function ev(pair: [number, number], extra: Partial<ProviderEvidence> = {}): ProviderEvidence {
  const [delivered, settled] = pair;
  return {
    ...NO_EVIDENCE,
    pair: { delivered, settled, avgSecondsToCode: 60 },
    service: { delivered, settled },
    country: { delivered, settled },
    overall: { delivered, settled },
    ...extra,
  };
}
const cand = (providerId: string, evidence: ProviderEvidence, marginShare = 0.5): PickupCandidate => ({ providerId, evidence, marginShare });
const never = () => 0.99; // no exploration

test("one provider: nothing to choose", () => {
  const d = rankProviders([cand("grizzlysms", NO_EVIDENCE)], S);
  assert.deepEqual(d.order, ["grizzlysms"]);
  assert.equal(d.mode, "single");
});

test("switched off: the given order (cheapest first) stands", () => {
  const d = rankProviders([cand("dogesms", ev([10, 100])), cand("grizzlysms", ev([90, 100]))], { ...S, enabled: false });
  assert.deepEqual(d.order, ["dogesms", "grizzlysms"]);
});

test("each pair is judged on its own record: DogeSMS for one country, GrizzlySMS for another", () => {
  const kenya = rankProviders([cand("grizzlysms", ev([50, 100])), cand("dogesms", ev([90, 100]))], S, never);
  assert.deepEqual(kenya.order, ["dogesms", "grizzlysms"]);
  assert.equal(kenya.mode, "scored");
  const nigeria = rankProviders([cand("grizzlysms", ev([92, 100])), cand("dogesms", ev([40, 100]))], S, never);
  assert.deepEqual(nigeria.order, ["grizzlysms", "dogesms"]);
});

test("more orders is not better: a higher delivery rate wins over a bigger history", () => {
  const d = rankProviders([cand("grizzlysms", ev([180, 300])), cand("dogesms", ev([45, 50]))], S, never);
  assert.equal(d.order[0], "dogesms");
});

test("a lucky tiny sample does not beat a proven record", () => {
  const tiny = deliveryEstimate(ev([3, 3]), S);
  const proven = deliveryEstimate(ev([95, 100]), S);
  assert.ok(tiny.lower < proven.lower, `${tiny.lower} < ${proven.lower}`);
  const d = rankProviders([cand("dogesms", ev([3, 3])), cand("grizzlysms", ev([95, 100]))], S, never);
  assert.equal(d.order[0], "grizzlysms");
});

test("too little data everywhere: the safe default first, and a small share explores", () => {
  const thin = [cand("dogesms", ev([2, 2])), cand("grizzlysms", ev([1, 2]))];
  const d = rankProviders(thin, S, never);
  assert.equal(d.mode, "default");
  assert.deepEqual(d.order, ["grizzlysms", "dogesms"]);
  const explore = rankProviders(thin, S, () => 0.01);
  assert.equal(explore.mode, "exploration");
  assert.equal(explore.order[0], "dogesms");
  assert.equal(explore.order.length, 2);
  const noExplore = rankProviders(thin, { ...S, explorationPercent: 0 }, () => 0);
  assert.equal(noExplore.order[0], "grizzlysms");
});

test("a provider failing most recent requests is set aside until it recovers", () => {
  const failing = { ...ev([95, 100]), attempts: { total: 12, ok: 2, outOfStock: 0, failed: 10, avgLatencyMs: 9000 } };
  const d = rankProviders([cand("grizzlysms", failing), cand("dogesms", ev([80, 100]))], S, never);
  assert.deepEqual(d.order, ["dogesms", "grizzlysms"]);
  assert.equal(d.setAside[0].providerId, "grizzlysms");
});

test("never every provider set aside at once", () => {
  const failing = { ...ev([95, 100]), attempts: { total: 12, ok: 2, outOfStock: 0, failed: 10, avgLatencyMs: null } };
  const d = rankProviders([cand("grizzlysms", failing), cand("dogesms", failing)], S, never);
  assert.equal(d.order.length, 2);
  assert.equal(d.setAside.length, 0);
});

test("with equal delivery, speed and margin decide", () => {
  const fast = { ...ev([90, 100]), pair: { delivered: 90, settled: 100, avgSecondsToCode: 20 } };
  const slow = { ...ev([90, 100]), pair: { delivered: 90, settled: 100, avgSecondsToCode: 500 } };
  assert.equal(rankProviders([cand("grizzlysms", slow), cand("dogesms", fast)], S, never).order[0], "dogesms");
  assert.equal(rankProviders([cand("grizzlysms", ev([90, 100]), 0.6), cand("dogesms", ev([90, 100]), 0.1)], S, never).order[0], "grizzlysms");
});

test("settings are clamped to safe ranges and survive bad input", () => {
  assert.deepEqual(parseSmartPickupSettings("not json"), DEFAULT_SMART_PICKUP);
  const s = parseSmartPickupSettings(JSON.stringify({ windowDays: 9999, explorationPercent: 90, weights: { success: -1 }, defaultProvider: "dogesms", enabled: false }));
  assert.equal(s.windowDays, 180);
  assert.equal(s.explorationPercent, 50);
  assert.equal(s.weights.success, 0);
  assert.equal(s.defaultProvider, "dogesms");
  assert.equal(s.enabled, false);
});
