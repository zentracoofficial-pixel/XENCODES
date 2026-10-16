import test from "node:test";
import assert from "node:assert/strict";
import robots, { AI_SEARCH_BOTS, DISALLOWED_PATHS, TRAINING_BOTS } from "../src/app/robots";
import { INDEXNOW_BATCH, INDEXNOW_KEY, submitToIndexNow } from "../src/lib/indexnow";
import { GET as llmsTxt } from "../src/app/llms.txt/route";
import { readFileSync } from "node:fs";

test("robots.txt names each AI search bot and keeps private paths disallowed for all of them", () => {
  const rules = [robots().rules].flat();
  const named = new Set(rules.flatMap((rule) => [rule.userAgent].flat()));
  for (const bot of [...AI_SEARCH_BOTS, ...TRAINING_BOTS, "*"]) assert.ok(named.has(bot), `${bot} is missing`);
  for (const rule of rules) {
    assert.deepEqual(rule.disallow, DISALLOWED_PATHS, "a named group does not inherit from *, so each repeats the list");
    assert.equal(rule.allow, "/");
  }
  assert.ok(DISALLOWED_PATHS.includes("/dashboard") && DISALLOWED_PATHS.includes("/admin") && DISALLOWED_PATHS.includes("/api/"));
});

test("the IndexNow key file is served and matches the key", () => {
  assert.equal(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8").trim(), INDEXNOW_KEY);
});

test("IndexNow submits in batches, counts only accepted ones, and never throws", async () => {
  const realFetch = globalThis.fetch;
  const sizes: number[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.key, INDEXNOW_KEY);
    assert.equal(body.host, "www.xencodes.com");
    sizes.push(body.urlList.length);
    return new Response(null, { status: sizes.length === 1 ? 200 : 202 });
  }) as typeof fetch;
  try {
    const urls = Array.from({ length: INDEXNOW_BATCH + 5 }, (_, i) => `https://www.xencodes.com/p/${i}`);
    const outcome = await submitToIndexNow(urls);
    assert.deepEqual(sizes, [INDEXNOW_BATCH, 5]);
    assert.equal(outcome.submitted, INDEXNOW_BATCH + 5);

    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const failed = await submitToIndexNow(urls.slice(0, 3));
    assert.equal(failed.submitted, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("llms.txt is plain text, states the limits honestly and links the key pages", async () => {
  const response = llmsTxt();
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
  const text = await response.text();
  assert.match(text, /^# Xencodes/);
  assert.match(text, /refunded/i);
  assert.match(text, /not guaranteed/i);
  assert.match(text, /\/acceptable-use/);
  assert.doesNotMatch(text, /bypass|untraceable|avoid (a )?ban/i);
});
