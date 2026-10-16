import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * The DogeSMS adapter against a stubbed DogeSMS that answers the way its
 * documentation describes (https://www.dogesms.com/docs). No network, no
 * database: the house directory and the webhook store are injected.
 */

const { DogeSmsProvider, toOrderStatus } = await import("../src/lib/provider/dogesms");
const { buildHouseDirectory, houseServiceSlug } = await import("../src/lib/provider/house-directory");
const { ProviderError } = await import("../src/lib/provider/types");

const KEY = "sk_live_test_secret_123";
const directory = buildHouseDirectory(
  [
    { slug: "usa", name: "USA" },
    { slug: "usa-2", name: "USA (2)" },
    { slug: "united-kingdom", name: "United Kingdom" },
    { slug: "nigeria", name: "Nigeria" },
  ],
  ["whatsapp", "telegram", "instagram-threads", "google-gmail-youtube"],
);

type Handler = (req: { method: string; path: string; query: URLSearchParams; headers: Record<string, string>; body: unknown }) => { status: number; body?: unknown } | Error;
let handler: Handler;
let calls: Array<{ method: string; path: string; headers: Record<string, string>; body: unknown }> = [];
let stored: Record<string, { status: string; phoneNumber?: string; code?: string }> = {};

const fakeFetch = (async (input: unknown, init?: RequestInit) => {
  const url = new URL(String(input));
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const req = { method: init?.method ?? "GET", path: url.pathname, query: url.searchParams, headers, body };
  calls.push({ method: req.method, path: req.path, headers, body });
  const res = handler(req);
  if (res instanceof Error) throw res;
  return new Response(res.body === undefined ? "" : JSON.stringify(res.body), { status: res.status });
}) as typeof fetch;

const catalog: Handler = (req) => {
  if (req.path === "/v1/catalog/services")
    return { status: 200, body: { data: [{ code: "wa", name: "WhatsApp" }, { code: "ig", name: "Instagram" }, { code: "tw", name: "Tinder" }, { code: "go", name: "Google" }] } };
  if (req.path === "/v1/catalog/countries")
    return { status: 200, body: { data: [{ code: "US", name: "United States", phone_prefix: "1" }, { code: "NG", name: "Nigeria", phone_prefix: "234" }, { code: "KE", name: "Kenya", phone_prefix: "254" }] } };
  if (req.path === "/v1/catalog/prices") {
    const cc = req.query.get("country_code");
    if (cc === "US") return { status: 200, body: { data: [{ service_code: "wa", price_cents: 45 }, { service_code: "ig", price_cents: 30, count: 0 }, { service_code: "tw", price_cents: 20 }] } };
    if (cc === "NG") return { status: 200, body: { data: [{ service_code: "wa", price_cents: 60, count: 5 }] } };
    return { status: 200, body: { data: [] } };
  }
  return { status: 404, body: { error: { code: "NOT_FOUND" } } };
};

function provider(extra: Partial<ConstructorParameters<typeof DogeSmsProvider>[0]> = {}) {
  return new DogeSmsProvider({
    apiKey: KEY,
    fetchImpl: fakeFetch,
    directory: async () => directory,
    readOrderState: async (id) => stored[id] ?? null,
    sleep: async () => {},
    allocationWaitMs: 50,
    newIdempotencyKey: () => "idem-1",
    ...extra,
  });
}

beforeEach(() => {
  DogeSmsProvider.resetForTests();
  calls = [];
  stored = {};
  handler = catalog;
});

test("countries and services sell under the house listing; restricted ones never appear", async () => {
  const services = await provider().getServices();
  const slugs = services.map((s) => s.slug).sort();
  assert.deepEqual(slugs, ["google-gmail-youtube", "instagram-threads", "whatsapp"]);
  const usa = await provider().getAvailability("whatsapp", "usa");
  assert.equal(usa?.country.slug, "usa");
  assert.equal(usa?.costUsdCents, 45);
  assert.equal(usa?.country.dialCode, "+1");
  assert.equal(await provider().getAvailability("whatsapp", "united-states"), null);
  const snapshot = await provider().getCatalogSnapshot({ deadline: Date.now() + 5_000 });
  const whatsapp = snapshot.entries.filter((e) => e.service.slug === "whatsapp").map((e) => e.country.slug).sort();
  assert.deepEqual(whatsapp, ["nigeria", "usa"]);
  assert.equal(snapshot.countriesTotal, 3);
  assert.deepEqual([...snapshot.countriesRead].sort(), ["kenya", "nigeria", "usa"]);
  assert.ok(provider().getBlockedServices().some((b) => b.name === "Tinder"));
});

test("a listing with no numbers is not on sale; a count is reported only when DogeSMS gives one", async () => {
  assert.equal(await provider().getAvailability("instagram-threads", "usa"), null);
  const ng = await provider().getAvailability("whatsapp", "nigeria");
  assert.equal(ng?.stockCount, 5);
  assert.equal(ng?.stock, "low");
  const us = await provider().getAvailability("whatsapp", "usa");
  assert.equal(us?.stockCount, undefined);
});

test("an order: Bearer key, idempotency key, price cap, and the number when it comes back at once", async () => {
  handler = (req) =>
    req.path === "/v1/orders" && req.method === "POST"
      ? { status: 201, body: { data: { id: "ord_1", status: "active", phone_number: "+1 555-0100", price_cents: 45 } } }
      : catalog(req);
  const bought = await provider().purchaseNumber("whatsapp", "usa", 45);
  assert.deepEqual(bought, { providerOrderId: "ord_1", phoneNumber: "+15550100", sessionSeconds: 1200, costUsdCents: 45 });
  const post = calls.find((c) => c.method === "POST")!;
  assert.equal(post.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(post.headers["X-Idempotency-Key"], "idem-1");
  assert.deepEqual(post.body, { service_code: "wa", country_code: "US", max_price_cents: 45 });
});

test("a number allocated after the order is picked up from the webhook store", async () => {
  let polls = 0;
  handler = (req) => {
    if (req.path === "/v1/orders" && req.method === "POST") return { status: 201, body: { data: { order_id: "ord_2", status: "pending" } } };
    if (req.path === "/v1/orders/ord_2") {
      polls += 1;
      return { status: 403, body: { error: { code: "STATUS_QUERIES_DISABLED" } } };
    }
    return catalog(req);
  };
  stored.ord_2 = { status: "active", phoneNumber: "2348012345678" };
  const bought = await provider({ allocationWaitMs: 5_000 }).purchaseNumber("whatsapp", "nigeria");
  assert.equal(bought.phoneNumber, "+2348012345678");
  assert.equal(polls, 1, "the disabled status call is asked once, then only the store");
});

test("no number in time: the order is cancelled and reported as nothing bought", async () => {
  handler = (req) => {
    if (req.path === "/v1/orders" && req.method === "POST") return { status: 201, body: { data: { id: "ord_3", status: "pending" } } };
    if (req.path === "/v1/orders/ord_3/cancel") return { status: 200, body: { data: { id: "ord_3", status: "cancelled" } } };
    if (req.path === "/v1/orders/ord_3") return { status: 200, body: { data: { id: "ord_3", status: "pending" } } };
    return catalog(req);
  };
  await assert.rejects(provider({ allocationWaitMs: 0 }).purchaseNumber("whatsapp", "usa"), (e: unknown) => e instanceof ProviderError && e.code === "out_of_stock");
  assert.ok(calls.some((c) => c.path === "/v1/orders/ord_3/cancel"));
});

test("…and if the cancel fails, the outcome is unknown (never treated as nothing bought)", async () => {
  handler = (req) => {
    if (req.path === "/v1/orders" && req.method === "POST") return { status: 201, body: { data: { id: "ord_4", status: "pending" } } };
    if (req.path === "/v1/orders/ord_4/cancel") return new Error("socket hang up");
    if (req.path === "/v1/orders/ord_4") return { status: 200, body: { data: { id: "ord_4", status: "pending" } } };
    return catalog(req);
  };
  await assert.rejects(provider({ allocationWaitMs: 0 }).purchaseNumber("whatsapp", "usa"), (e: unknown) => e instanceof ProviderError && e.code === "network");
});

test("a lost answer is asked again with the SAME idempotency key, so no second order is created", async () => {
  let posts = 0;
  handler = (req) => {
    if (req.path === "/v1/orders" && req.method === "POST") {
      posts += 1;
      return posts === 1 ? { status: 502, body: "bad gateway" } : { status: 201, body: { data: { id: "ord_5", status: "active", phone_number: "15550101" } } };
    }
    return catalog(req);
  };
  const bought = await provider().purchaseNumber("whatsapp", "usa");
  assert.equal(bought.providerOrderId, "ord_5");
  const keys = calls.filter((c) => c.method === "POST" && c.path === "/v1/orders").map((c) => c.headers["X-Idempotency-Key"]);
  assert.deepEqual(keys, ["idem-1", "idem-1"]);
});

test("no answer at all, twice: outcome unknown, reported as such", async () => {
  handler = (req) => (req.path === "/v1/orders" && req.method === "POST" ? new Error("ETIMEDOUT") : catalog(req));
  await assert.rejects(provider().purchaseNumber("whatsapp", "usa"), (e: unknown) => e instanceof ProviderError && e.code === "network" && !e.message.includes(KEY));
});

test("documented refusals: no numbers = out of stock; price changed, no balance, bad key = refused", async () => {
  const cases: Array<[number, unknown, string]> = [
    [422, { error: { code: "NO_NUMBERS_AVAILABLE" } }, "out_of_stock"],
    [412, { error: { code: "PRICE_CHANGED" } }, "rejected"],
    [422, { error: { code: "INSUFFICIENT_BALANCE" } }, "rejected"],
    [401, { error: { code: "UNAUTHORIZED" } }, "rejected"],
    [403, { error: { code: "WEBHOOK_REQUIRED" } }, "not_configured"],
  ];
  for (const [status, body, code] of cases) {
    DogeSmsProvider.resetForTests();
    handler = (req) => (req.path === "/v1/orders" && req.method === "POST" ? { status, body } : catalog(req));
    await assert.rejects(provider().purchaseNumber("whatsapp", "usa"), (e: unknown) => e instanceof ProviderError && e.code === code && !e.message.includes(KEY), `${status} ${JSON.stringify(body)}`);
  }
});

test("order status: code from the webhook store when status queries are off", async () => {
  handler = (req) => (req.path.startsWith("/v1/orders/") ? { status: 403, body: { error: { code: "DISABLED" } } } : catalog(req));
  stored.ord_6 = { status: "completed", phoneNumber: "15550102", code: "482913" };
  assert.deepEqual(await provider().getOrderStatus("ord_6"), { state: "received", code: "482913" });
  assert.deepEqual(toOrderStatus({ status: "expired" }), { state: "refunded" });
  assert.deepEqual(toOrderStatus({ status: "failed" }), { state: "refunded" });
  assert.deepEqual(toOrderStatus({ status: "cancelled" }), { state: "cancelled" });
  assert.deepEqual(toOrderStatus({ status: "active", phoneNumber: "1" }), { state: "waiting" });
  assert.deepEqual(toOrderStatus(null), { state: "waiting" });
});

test("balance in cents, and the key never appears in what comes back", async () => {
  handler = (req) => (req.path === "/v1/balance" ? { status: 200, body: { data: { balance_cents: 1234, currency: "USD" }, request_id: "r1" } } : catalog(req));
  assert.equal(await provider().getProviderBalanceUsdCents(), 1234);
  const test1 = await provider().testConnection();
  assert.equal(test1.ok, true);
  assert.ok(!JSON.stringify(test1).includes(KEY));
});

test("service names map to house listings only when clearly the same", () => {
  assert.equal(houseServiceSlug("instagram", directory), "instagram-threads");
  assert.equal(houseServiceSlug("whatsapp", directory), "whatsapp");
  assert.equal(houseServiceSlug("uber", directory), "uber");
});

test("sync read: a 429 slows the read down and retries, instead of losing the country", async () => {
  const waits: number[] = [];
  let refusedOnce = false;
  handler = (req) => {
    if (req.path === "/v1/catalog/prices" && req.query.get("country_code") === "NG" && !refusedOnce) {
      refusedOnce = true;
      return { status: 429, body: { error: { code: "RATE_LIMITED" } } };
    }
    return catalog(req);
  };
  const snapshot = await provider({ sleep: async (ms) => void waits.push(ms) }).getCatalogSnapshot({ deadline: Date.now() + 60_000 });
  assert.deepEqual([...snapshot.countriesRead].sort(), ["kenya", "nigeria", "usa"]);
  assert.deepEqual(snapshot.countriesFailed, []);
  assert.equal(snapshot.rateLimited, true);
  assert.ok(waits.some((ms) => ms > 0), "waited before asking again");
  assert.ok(snapshot.entries.some((e) => e.country.slug === "nigeria"));
});

test("sync read: a country refused every time counts as failed; the others are still read", async () => {
  handler = (req) =>
    req.path === "/v1/catalog/prices" && req.query.get("country_code") === "KE"
      ? { status: 429, body: { error: { code: "RATE_LIMITED" } } }
      : catalog(req);
  const snapshot = await provider().getCatalogSnapshot({ deadline: Date.now() + 60_000 });
  assert.deepEqual(snapshot.countriesFailed, ["kenya"]);
  assert.deepEqual([...snapshot.countriesRead].sort(), ["nigeria", "usa"]);
});

test("sync read: stops at the deadline and reports only what it read", async () => {
  const snapshot = await provider().getCatalogSnapshot({ deadline: Date.now() - 1 });
  assert.deepEqual(snapshot.countriesRead, []);
  assert.equal(snapshot.entries.length, 0);
  assert.equal(snapshot.countriesTotal, 3);
});

test("sync read: countries never synced come first, then the ones synced longest ago", async () => {
  const order: string[] = [];
  handler = (req) => {
    if (req.path === "/v1/catalog/prices") order.push(req.query.get("country_code")!);
    return catalog(req);
  };
  // One at a time is forced by a refusal-free run with a deadline that
  // allows everything; the order of requests is what is checked.
  await provider().getCatalogSnapshot({ deadline: Date.now() + 60_000, countryOrder: ["usa", "nigeria"] });
  assert.equal(order[0], "KE");
  assert.deepEqual(order.slice(1), ["US", "NG"]);
});

/** An in-memory stand-in for the settings-table copy of the lists. */
function memoryStore(initial: { servicesRaw: unknown; countriesRaw: unknown; at: number } | null = null) {
  let value = initial;
  return {
    read: async () => value,
    write: async (next: { servicesRaw: unknown; countriesRaw: unknown; at: number }) => void (value = next),
    get: () => value,
  };
}
const listsOf = () => ({
  // As saved: the answer with its envelope already removed.
  servicesRaw: [{ code: "wa", name: "WhatsApp" }],
  countriesRaw: [{ code: "US", name: "United States", phone_prefix: "1" }],
});

test("a reply whose body stalls is a timeout error, not a raw one", async () => {
  // Headers arrive, then the body is cut off by the request's time limit.
  const stalled = (async () => {
    const body = new ReadableStream({
      start(controller) {
        setTimeout(() => controller.error(new DOMException("The operation was aborted due to timeout", "TimeoutError")), 20);
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  await assert.rejects(
    provider({ fetchImpl: stalled, catalogStore: null }).getServices(),
    (error: unknown) => error instanceof ProviderError && error.code === "network" && /did not respond in time/.test(error.message),
  );
});

test("the saved lists are used without asking DogeSMS while they are fresh", async () => {
  const store = memoryStore({ ...listsOf(), at: Date.now() - 60_000 });
  const slow: Handler = (req) => (req.path.startsWith("/v1/catalog/") && req.path !== "/v1/catalog/prices" ? new Error("must not be asked") : catalog(req));
  handler = slow;
  const services = await provider({ catalogStore: store }).getServices();
  assert.deepEqual(services.map((s) => s.slug), ["whatsapp"]);
  assert.equal(calls.filter((c) => c.path === "/v1/catalog/services").length, 0);
});

test("fresh lists are saved; a slow DogeSMS falls back to an older saved copy, a very old one does not", async () => {
  const store = memoryStore();
  await provider({ catalogStore: store }).getServices();
  assert.ok(store.get(), "saved after a successful read");

  DogeSmsProvider.resetForTests();
  const old = memoryStore({ ...listsOf(), at: Date.now() - 24 * 60 * 60 * 1000 });
  handler = (req) => (req.path.startsWith("/v1/catalog/") && req.path !== "/v1/catalog/prices" ? new Error("down") : catalog(req));
  const services = await provider({ catalogStore: old }).getServices();
  assert.deepEqual(services.map((s) => s.slug), ["whatsapp"]);

  DogeSmsProvider.resetForTests();
  const ancient = memoryStore({ ...listsOf(), at: Date.now() - 30 * 24 * 60 * 60 * 1000 });
  await assert.rejects(provider({ catalogStore: ancient }).getServices(), ProviderError);
});

test("sync read: with nothing synced yet, the best-known countries are read first", async () => {
  const order: string[] = [];
  handler = (req) => {
    if (req.path === "/v1/catalog/prices") order.push(req.query.get("country_code")!);
    return catalog(req);
  };
  // Concurrency is 5 and there are 3 countries, so the order requests are
  // sent in is the order they were queued in.
  await provider().getCatalogSnapshot({ deadline: Date.now() + 60_000 });
  assert.deepEqual(order, ["US", "NG", "KE"]);
});

test("sync read: a slow country holds up only its own slot, not the countries behind it", async () => {
  const codes = Array.from({ length: 24 }, (_, i) => `C${String(i).padStart(2, "0")}`);
  const countryRows = codes.map((code, i) => ({ code, name: `Testland ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, phone_prefix: "9" }));
  const events: string[] = [];
  const fetchSlowFirst = (async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/catalog/services") return new Response(JSON.stringify({ data: [{ code: "wa", name: "WhatsApp" }] }), { status: 200 });
    if (url.pathname === "/v1/catalog/countries") return new Response(JSON.stringify({ data: countryRows }), { status: 200 });
    const code = url.searchParams.get("country_code")!;
    events.push(`start ${code}`);
    // The first country's answer takes a long time; the rest are instant.
    if (code === "C00") await new Promise((resolve) => setTimeout(resolve, 250));
    events.push(`end ${code}`);
    return new Response(JSON.stringify({ data: [{ service_code: "wa", price_cents: 40 }] }), { status: 200 });
  }) as typeof fetch;
  const snapshot = await provider({ fetchImpl: fetchSlowFirst, catalogStore: null }).getCatalogSnapshot({ deadline: Date.now() + 60_000 });
  assert.equal(snapshot.countriesRead.length, 24);
  const slowEnded = events.indexOf("end C00");
  const startedBefore = events.slice(0, slowEnded).filter((e) => e.startsWith("start ")).length;
  // In groups of eight, nothing past the eighth would start until C00 ended.
  assert.ok(startedBefore > 8, `only ${startedBefore} countries started while the slow one was pending`);
});
