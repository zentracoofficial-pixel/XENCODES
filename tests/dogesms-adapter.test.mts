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
  const kenya = (await provider().getCountries("whatsapp")).map((o) => o.country.slug).sort();
  assert.deepEqual(kenya, ["nigeria", "usa"]);
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
  assert.deepEqual(bought, { providerOrderId: "ord_1", phoneNumber: "15550100", sessionSeconds: 1200, costUsdCents: 45 });
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
  assert.equal(bought.phoneNumber, "2348012345678");
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
