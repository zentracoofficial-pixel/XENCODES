import test from "node:test";
import assert from "node:assert/strict";
import { runUntilCurrent } from "../src/lib/sync-runner";
import { summarize, type ProviderSyncOutcome } from "../src/lib/sync-result";

const done = (id: string): ProviderSyncOutcome => ({ id, label: id, ok: true, result: "success" });
const partial = (id: string, current: number, read = 40): ProviderSyncOutcome => ({
  id, label: id, ok: true, result: "partial", countriesRead: read, countriesCurrent: current, countriesTotal: 210,
});

test("one click keeps going until the server is current, asking only the server that needs more", async () => {
  const calls: string[] = [];
  const steps = [partial("two", 80), partial("two", 150), done("two")];
  const result = await runUntilCurrent({
    first: async () => summarize([done("one"), partial("two", 40)]),
    again: async (id) => {
      calls.push(id);
      return summarize([steps.shift()!]);
    },
  });
  assert.deepEqual(calls, ["two", "two", "two"]);
  assert.equal(result.result, "success");
  assert.equal(result.providers?.length, 2, "the finished server is kept in the combined result");
});

test("it stops when a pass reads nothing, so a refused server is not hammered", async () => {
  let again = 0;
  const result = await runUntilCurrent({
    first: async () => summarize([partial("two", 40)]),
    again: async () => {
      again += 1;
      return summarize([partial("two", 40, 0)]);
    },
  });
  assert.equal(again, 1);
  assert.equal(result.result, "partial");
});

test("it stops when asked, and at the pass ceiling", async () => {
  let stop = false;
  let passes = 0;
  await runUntilCurrent({
    first: async () => summarize([partial("two", 10)]),
    again: async () => {
      passes += 1;
      stop = true;
      return summarize([partial("two", 20)]);
    },
    shouldStop: () => stop,
  });
  assert.equal(passes, 1);

  let ceiling = 0;
  await runUntilCurrent({
    first: async () => summarize([partial("two", 1)]),
    again: async () => {
      ceiling += 1;
      return summarize([partial("two", 1 + ceiling)]);
    },
    maxPasses: 4,
  });
  assert.equal(ceiling, 3, "first pass plus three more");
});

test("a failed or skipped pass is not retried automatically", async () => {
  let again = 0;
  const failed: ProviderSyncOutcome = { id: "two", label: "two", ok: false, result: "failed", error: "down" };
  const result = await runUntilCurrent({
    first: async () => summarize([failed]),
    again: async () => {
      again += 1;
      return summarize([done("two")]);
    },
  });
  assert.equal(again, 0);
  assert.equal(result.result, "failed");
});
