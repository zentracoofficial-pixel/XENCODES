import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { splitRestricted } from "@/lib/restricted-services";
import { resolveCountryMeta, resolveIso2, slugify } from "./country-meta";
import {
  loadHouseDirectory,
  houseCountrySlug,
  houseServiceSlug,
  type HouseDirectory,
} from "./house-directory";
import {
  ProviderError,
  type NumberProvider,
  type ProviderAvailability,
  type ProviderCatalogEntry,
  type ProviderCountry,
  type ProviderOrderStatus,
  type ProviderService,
  type PurchasedNumber,
} from "./types";

/**
 * DogeSMS adapter: Server II.
 *
 * Built from DogeSMS's own API documentation (https://www.dogesms.com/docs):
 *  - REST API at https://api.dogesms.com, `Authorization: Bearer <key>`.
 *  - GET /v1/catalog/services, /v1/catalog/countries,
 *    /v1/catalog/prices?country_code=XX (USD cents).
 *  - POST /v1/orders {service_code, country_code, max_price_cents}, with an
 *    `X-Idempotency-Key` that makes a retried request return the original
 *    order instead of buying a second one. 412 PRICE_CHANGED when the price
 *    is above max_price_cents, 422 for no numbers or no balance.
 *  - POST /v1/orders/{id}/cancel.
 *  - Orders go pending -> active (number allocated) -> completed (code), or
 *    end expired (no SMS in time; DogeSMS refunds itself), cancelled or
 *    failed (no charge kept).
 *  - Results are delivered by signed webhook (order.number_allocated,
 *    order.completed, order.failed, order.expired); status queries are off
 *    by default. So this adapter reads an order's state from what its
 *    webhook stored (ProviderOrderState, written by
 *    src/app/api/webhooks/dogesms/route.ts), and asks GET /v1/orders/{id}
 *    only while that call answers.
 *
 * The documentation was read through excerpts; the exact JSON field names of
 * the order and price responses were not all visible, so they are read
 * tolerantly below (each field under the names the docs and this API family
 * use) and an answer that has none of them is refused, never guessed. Confirm
 * with one real order before relying on it.
 *
 * The API key never leaves this file: never logged, never returned.
 */

const DEFAULT_API_ORIGIN = "https://api.dogesms.com";
const REQUEST_TIMEOUT_MS = 12_000;
const CATALOG_TTL_MS = 10 * 60 * 1000;
/** How long a purchase waits for DogeSMS to allocate a number when the
 *  order is created before one is ready. */
const DEFAULT_ALLOCATION_WAIT_MS = 15_000;
const ALLOCATION_POLL_MS = 1_000;
/** DogeSMS's countdown is "typically 5–20 minutes depending on the channel".
 *  The longest is used so Xencodes never gives up on an order DogeSMS is
 *  still serving; an earlier end arrives as order.expired. */
const DEFAULT_SESSION_SECONDS = 20 * 60;
const CATALOG_CONCURRENCY = 10;

export const DOGESMS_PROVIDER_ID = "dogesms";

type Json = Record<string, unknown>;

export interface StoredOrderState {
  status: string;
  phoneNumber?: string | null;
  code?: string | null;
  text?: string | null;
  errorCode?: string | null;
}

export interface DogeSmsOptions {
  apiKey: string;
  apiOrigin?: string;
  fetchImpl?: typeof fetch;
  /** Reads what the webhook stored for one order. */
  readOrderState?: (orderId: string) => Promise<StoredOrderState | null>;
  directory?: () => Promise<HouseDirectory>;
  allocationWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  newIdempotencyKey?: () => string;
}

interface CountryEntry {
  code: string;
  country: ProviderCountry;
}

type PriceTable = Map<string, { costUsdCents: number; stockCount?: number }>;

interface CatalogCache {
  services: Map<string, { code: string; service: ProviderService }>; // by our slug
  countries: Map<string, CountryEntry>; // by our slug
  codeToSlug: Map<string, string>; // DogeSMS service code -> our slug
  at: number;
}

export async function readDogeSmsOrderState(orderId: string): Promise<StoredOrderState | null> {
  return prisma.providerOrderState.findUnique({
    where: { providerId_providerOrderId: { providerId: DOGESMS_PROVIDER_ID, providerOrderId: orderId } },
    select: { status: true, phoneNumber: true, code: true, text: true, errorCode: true },
  });
}

export class DogeSmsProvider implements NumberProvider {
  readonly id = DOGESMS_PROVIDER_ID;
  readonly label = "DogeSMS";

  private readonly apiKey: string;
  private readonly origin: string;
  private readonly fetchImpl: typeof fetch;
  private readonly readOrderState: (orderId: string) => Promise<StoredOrderState | null>;
  private readonly directory: () => Promise<HouseDirectory>;
  private readonly allocationWaitMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly newIdempotencyKey: () => string;

  private static catalog: CatalogCache | null = null;
  /** our country slug -> that country's prices, by our service slug */
  private static prices = new Map<string, { table: PriceTable; at: number }>();
  private static blocked: Array<{ name: string; slug: string; category: string; term: string }> = [];
  /** Flipped off the first time the status endpoint says it is disabled. */
  private static statusQueriesWork = true;

  constructor(options: DogeSmsOptions) {
    this.apiKey = options.apiKey;
    this.origin = options.apiOrigin ?? DEFAULT_API_ORIGIN;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.readOrderState = options.readOrderState ?? readDogeSmsOrderState;
    this.directory = options.directory ?? loadHouseDirectory;
    this.allocationWaitMs = options.allocationWaitMs ?? DEFAULT_ALLOCATION_WAIT_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.newIdempotencyKey = options.newIdempotencyKey ?? randomUUID;
  }

  /** For tests: forget the cached catalog and learned behaviour. */
  static resetForTests() {
    DogeSmsProvider.catalog = null;
    DogeSmsProvider.prices = new Map();
    DogeSmsProvider.blocked = [];
    DogeSmsProvider.statusQueriesWork = true;
  }

  // ---------------------------------------------------------------- HTTP

  private async request(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string>; body?: Json; idempotencyKey?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(path, this.origin);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey;

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      console.error(`[dogesms] <- ${method} ${path} ${timedOut ? "timed out" : "failed"} after ${Date.now() - startedAt}ms`);
      throw new ProviderError(timedOut ? "DogeSMS did not respond in time." : "DogeSMS could not be reached.", "network");
    }
    const text = await response.text();
    console.log(`[dogesms] <- ${method} ${path} HTTP ${response.status}, ${text.length} bytes, ${Date.now() - startedAt}ms`);
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body };
  }

  /** A failed answer as a ProviderError, classified by what it means for a
   *  purchase: out_of_stock and rejected mean nothing was bought. */
  private errorFor(status: number, body: unknown, context: string): ProviderError {
    const code = errorCodeOf(body);
    const message = `DogeSMS ${context}: HTTP ${status}${code ? ` ${code}` : ""}`;
    if (status === 401 || status === 403) return new ProviderError(message, code === "WEBHOOK_REQUIRED" ? "not_configured" : "rejected");
    if (code && /NO_NUMBER|OUT_OF_STOCK|UNAVAILABLE|NOT_AVAILABLE/i.test(code)) return new ProviderError(message, "out_of_stock");
    if (status === 412 || status === 400 || status === 404 || status === 409 || status === 422 || status === 429) {
      return new ProviderError(message, "rejected");
    }
    return new ProviderError(message, status >= 500 ? "network" : "unknown");
  }

  private async getJson(path: string, query?: Record<string, string>): Promise<unknown> {
    const { status, body } = await this.request("GET", path, { query });
    if (status < 200 || status >= 300) throw this.errorFor(status, body, `GET ${path}`);
    return unwrap(body);
  }

  // ------------------------------------------------------------- catalog

  private async loadCatalog(force = false): Promise<CatalogCache> {
    const current = DogeSmsProvider.catalog;
    if (!force && current && Date.now() - current.at < CATALOG_TTL_MS) return current;

    const [servicesRaw, countriesRaw, directory] = await Promise.all([
      this.getJson("/v1/catalog/services"),
      this.getJson("/v1/catalog/countries"),
      this.directory().catch(() => ({ countrySlugByIso2: new Map(), serviceSlugs: new Set<string>() })),
    ]);

    const serviceRows = listOf(servicesRaw, ["services", "items"]).flatMap((row) => {
      const code = str(row.code) ?? str(row.service_code) ?? str(row.id);
      const name = str(row.name) ?? code;
      if (!code || !name) return [];
      const slug = houseServiceSlug(slugify(name), directory);
      return [{ code, name, slug }];
    });
    if (serviceRows.length === 0) throw new ProviderError("DogeSMS returned no services.", "unknown");

    const { allowed, blocked } = splitRestricted(serviceRows);
    DogeSmsProvider.blocked = blocked.map(({ name, slug, category, term }) => ({ name, slug, category, term }));
    const services = new Map<string, { code: string; service: ProviderService }>();
    for (const row of allowed) {
      if (services.has(row.slug)) continue;
      services.set(row.slug, {
        code: row.code,
        service: { slug: row.slug, name: row.name, color: "#63756F", category: "All services", providerServiceId: row.code },
      });
    }

    const countries = new Map<string, CountryEntry>();
    for (const row of listOf(countriesRaw, ["countries", "items"])) {
      const code = str(row.code) ?? str(row.country_code) ?? str(row.id);
      const name = str(row.name);
      if (!code || !name) continue;
      const iso2 = /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : resolveIso2(name);
      const meta = resolveCountryMeta(name);
      const slug = houseCountrySlug(iso2, meta.slug, directory);
      if (countries.has(slug)) continue;
      const prefix = str(row.phone_prefix);
      countries.set(slug, {
        code,
        country: {
          ...meta,
          slug,
          dialCode: meta.dialCode || (prefix ? `+${prefix.replace(/^\+/, "")}` : ""),
          providerCountryId: code,
        },
      });
    }

    const codeToSlug = new Map([...services].map(([slug, entry]) => [entry.code, slug]));
    const catalog: CatalogCache = { services, countries, codeToSlug, at: Date.now() };
    DogeSmsProvider.catalog = catalog;
    return catalog;
  }

  /** One country's prices, from cache unless `fresh`. */
  private async pricesFor(catalog: CatalogCache, countrySlug: string, fresh = false): Promise<PriceTable | null> {
    const country = catalog.countries.get(countrySlug);
    if (!country) return null;
    const cached = DogeSmsProvider.prices.get(countrySlug);
    if (!fresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.table;
    const table = this.parsePrices(await this.getJson("/v1/catalog/prices", { country_code: country.code }), catalog.codeToSlug);
    DogeSmsProvider.prices.set(countrySlug, { table, at: Date.now() });
    return table;
  }

  /** Every country's prices, a few countries at a time. A country whose
   *  prices cannot be read is left out, not guessed. */
  private async allPrices(catalog: CatalogCache, fresh = false): Promise<Map<string, PriceTable>> {
    const out = new Map<string, PriceTable>();
    const slugs = [...catalog.countries.keys()];
    for (let i = 0; i < slugs.length; i += CATALOG_CONCURRENCY) {
      await Promise.all(
        slugs.slice(i, i + CATALOG_CONCURRENCY).map(async (slug) => {
          try {
            const table = await this.pricesFor(catalog, slug, fresh);
            if (table) out.set(slug, table);
          } catch (error) {
            console.error(`[dogesms] prices for ${slug} failed:`, error instanceof Error ? error.message : error);
          }
        }),
      );
    }
    return out;
  }

  private parsePrices(raw: unknown, codeToSlug: Map<string, string>): PriceTable {
    const out: PriceTable = new Map();
    for (const row of listOf(raw, ["prices", "services", "items"])) {
      const code = str(row.service_code) ?? str(row.code) ?? str(row.service);
      const slug = code ? codeToSlug.get(code) : undefined;
      if (!slug) continue;
      const cents = int(row.price_cents) ?? int(row.cost_cents) ?? int(row.price);
      if (cents === null || cents <= 0) continue;
      const count = int(row.count) ?? int(row.stock) ?? int(row.available_count) ?? int(row.quantity);
      if (row.available === false || count === 0) continue;
      out.set(slug, count === null ? { costUsdCents: cents } : { costUsdCents: cents, stockCount: count });
    }
    return out;
  }

  private availabilityFor(catalog: CatalogCache, serviceSlug: string, countrySlug: string, table: PriceTable | null | undefined): ProviderAvailability | null {
    const country = catalog.countries.get(countrySlug);
    const price = table?.get(serviceSlug);
    if (!country || !price || !catalog.services.has(serviceSlug)) return null;
    return {
      serviceSlug,
      country: country.country,
      costUsdCents: price.costUsdCents,
      // DogeSMS lists a price only for what it can sell; it gives a count
      // only sometimes, and none is invented when it does not.
      stock: price.stockCount !== undefined && price.stockCount < 10 ? "low" : "in_stock",
      ...(price.stockCount !== undefined ? { stockCount: price.stockCount } : {}),
    };
  }

  async getServices(): Promise<ProviderService[]> {
    const catalog = await this.loadCatalog();
    return [...catalog.services.values()].map((entry) => entry.service);
  }

  getBlockedServices() {
    return DogeSmsProvider.blocked;
  }

  getCatalogSyncedAt(): Date | null {
    return DogeSmsProvider.catalog ? new Date(DogeSmsProvider.catalog.at) : null;
  }

  async getCountries(serviceSlug: string): Promise<ProviderAvailability[]> {
    const catalog = await this.loadCatalog();
    if (!catalog.services.has(serviceSlug)) return [];
    const prices = await this.allPrices(catalog);
    return [...prices].flatMap(([countrySlug, table]) => {
      const offer = this.availabilityFor(catalog, serviceSlug, countrySlug, table);
      return offer ? [offer] : [];
    });
  }

  /** Fresh: one price call for this country, no cache. */
  async getAvailability(serviceSlug: string, countrySlug: string): Promise<ProviderAvailability | null> {
    const catalog = await this.loadCatalog();
    if (!catalog.countries.has(countrySlug) || !catalog.services.has(serviceSlug)) return null;
    return this.availabilityFor(catalog, serviceSlug, countrySlug, await this.pricesFor(catalog, countrySlug, true));
  }

  async getFullCatalog(): Promise<ProviderCatalogEntry[]> {
    const catalog = await this.loadCatalog(true);
    const entries: ProviderCatalogEntry[] = [];
    for (const [countrySlug, prices] of await this.allPrices(catalog, true)) {
      const country = catalog.countries.get(countrySlug);
      if (!country) continue;
      for (const [serviceSlug, price] of prices) {
        const service = catalog.services.get(serviceSlug);
        if (!service) continue;
        entries.push({
          service: service.service,
          country: country.country,
          costUsdCents: price.costUsdCents,
          stock: price.stockCount !== undefined && price.stockCount < 10 ? "low" : "in_stock",
          ...(price.stockCount !== undefined ? { stockCount: price.stockCount } : {}),
        });
      }
    }
    return entries;
  }

  async getCheapestCostByService(): Promise<Map<string, number>> {
    const catalog = await this.loadCatalog();
    const cheapest = new Map<string, number>();
    for (const prices of (await this.allPrices(catalog)).values()) {
      for (const [slug, { costUsdCents }] of prices) {
        const known = cheapest.get(slug);
        if (known === undefined || costUsdCents < known) cheapest.set(slug, costUsdCents);
      }
    }
    return cheapest;
  }

  async getCountryCount(): Promise<number> {
    const catalog = await this.loadCatalog();
    return [...(await this.allPrices(catalog)).values()].filter((prices) => prices.size > 0).length;
  }

  // -------------------------------------------------------------- orders

  /**
   * Creates one order. The idempotency key makes this safe to retry: a
   * request whose answer was lost is sent again with the same key, and
   * DogeSMS returns the order it already created instead of a second one, so
   * Xencodes learns what happened rather than guessing. Only when even that
   * cannot get an answer is the failure left "network" (outcome unknown),
   * which the purchase treats as possibly bought and never falls back from.
   */
  async purchaseNumber(serviceSlug: string, countrySlug: string, maxCostUsdCents?: number): Promise<PurchasedNumber> {
    const catalog = await this.loadCatalog();
    const service = catalog.services.get(serviceSlug);
    const country = catalog.countries.get(countrySlug);
    if (!service || !country) throw new ProviderError("Unknown service or country.", "rejected");

    const body: Json = { service_code: service.code, country_code: country.code };
    if (maxCostUsdCents !== undefined) body.max_price_cents = Math.ceil(maxCostUsdCents);
    const idempotencyKey = this.newIdempotencyKey();

    let answer: { status: number; body: unknown } | null = null;
    for (let attempt = 0; attempt < 2 && !answer; attempt++) {
      try {
        const result = await this.request("POST", "/v1/orders", { body, idempotencyKey });
        // A 5xx may or may not have created the order: ask again, same key.
        if (result.status >= 500 && attempt === 0) continue;
        answer = result;
      } catch (error) {
        if (attempt === 1) {
          throw new ProviderError(
            `DogeSMS order outcome unknown (idempotency key ${idempotencyKey}): ${error instanceof Error ? error.message : "no answer"}`,
            "network",
          );
        }
      }
    }
    if (!answer) {
      throw new ProviderError(`DogeSMS order outcome unknown (idempotency key ${idempotencyKey}).`, "network");
    }
    if (answer.status < 200 || answer.status >= 300) throw this.errorFor(answer.status, answer.body, "order");

    const order = unwrap(answer.body) as Json | null;
    const orderId = order ? (str(order.id) ?? str(order.order_id)) : null;
    if (!order || !orderId) {
      throw new ProviderError(`DogeSMS accepted the order but returned no order id (idempotency key ${idempotencyKey}).`, "network");
    }

    const costUsdCents = int(order.price_cents) ?? int(order.charged_cents) ?? int(order.cost_cents) ?? undefined;
    const sessionSeconds = sessionSecondsOf(order);
    let phoneNumber = str(order.phone_number);
    let failure: string | null = terminalFailure(str(order.status));

    // Allocation can come after the order: wait for the webhook (or the
    // status call, while it answers) to say which number it is.
    const deadline = Date.now() + this.allocationWaitMs;
    while (!phoneNumber && !failure && Date.now() < deadline) {
      await this.sleep(ALLOCATION_POLL_MS);
      const state = await this.currentState(orderId);
      if (state?.phoneNumber) phoneNumber = state.phoneNumber;
      failure = terminalFailure(state?.status ?? null);
    }

    if (phoneNumber) {
      return { providerOrderId: orderId, phoneNumber: normalizePhone(phoneNumber), sessionSeconds, ...(costUsdCents !== undefined ? { costUsdCents } : {}) };
    }
    if (failure) throw new ProviderError(`DogeSMS order ${orderId} ended ${failure} before a number was allocated.`, "out_of_stock");

    // No number in time: cancel, so nothing stays bought or charged. Only a
    // confirmed cancel makes this "nothing was bought".
    try {
      await this.cancelOrder(orderId);
    } catch (error) {
      throw new ProviderError(
        `DogeSMS order ${orderId} had no number after ${Math.round(this.allocationWaitMs / 1000)}s and could not be cancelled: ${error instanceof Error ? error.message : "unknown"}`,
        "network",
      );
    }
    throw new ProviderError(`DogeSMS allocated no number within ${Math.round(this.allocationWaitMs / 1000)}s; order ${orderId} cancelled.`, "out_of_stock");
  }

  /** What is known about an order: the status call while it works, else
   *  what the webhook stored. */
  private async currentState(orderId: string): Promise<StoredOrderState | null> {
    if (DogeSmsProvider.statusQueriesWork) {
      try {
        const { status, body } = await this.request("GET", `/v1/orders/${encodeURIComponent(orderId)}`);
        if (status >= 200 && status < 300) {
          const order = unwrap(body) as Json | null;
          if (order && str(order.status)) {
            return {
              status: str(order.status)!,
              phoneNumber: str(order.phone_number),
              code: str(order.sms_code),
              text: str(order.sms_content),
              errorCode: str(order.error_code),
            };
          }
        } else if (status === 403 || status === 404 || status === 405 || status === 501) {
          DogeSmsProvider.statusQueriesWork = false;
        }
      } catch {
        // Fall through to the stored state.
      }
    }
    return this.readOrderState(orderId);
  }

  async getOrderStatus(providerOrderId: string): Promise<ProviderOrderStatus> {
    const state = await this.currentState(providerOrderId);
    return toOrderStatus(state);
  }

  async cancelOrder(providerOrderId: string): Promise<void> {
    const { status, body } = await this.request("POST", `/v1/orders/${encodeURIComponent(providerOrderId)}/cancel`);
    if (status >= 200 && status < 300) return;
    // Already over (cancelled, expired, failed): nothing left to cancel.
    if (status === 409 || status === 410) return;
    throw this.errorFor(status, body, "cancel");
  }

  async getProviderBalanceUsdCents(): Promise<number | null> {
    const data = (await this.getJson("/v1/balance")) as Json | null;
    return data ? int(data.balance_cents) : null;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const cents = await this.getProviderBalanceUsdCents();
      return { ok: true, message: cents === null ? "Connected." : `Connected. Balance $${(cents / 100).toFixed(2)}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Connection failed." };
    }
  }
}

// ------------------------------------------------------------- helpers

function unwrap(body: unknown): unknown {
  if (body && typeof body === "object" && !Array.isArray(body) && "data" in (body as Json)) return (body as Json).data;
  return body;
}

function listOf(value: unknown, keys: string[]): Json[] {
  if (Array.isArray(value)) return value.filter((row): row is Json => !!row && typeof row === "object");
  if (value && typeof value === "object") {
    for (const key of keys) {
      const inner = (value as Json)[key];
      if (Array.isArray(inner)) return inner.filter((row): row is Json => !!row && typeof row === "object");
    }
  }
  return [];
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function int(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

function errorCodeOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 60) : null;
  const record = body as Json;
  const error = record.error;
  if (error && typeof error === "object") return str((error as Json).code) ?? str((error as Json).error_code);
  return str(record.error_code) ?? str(record.code) ?? str(error);
}

function sessionSecondsOf(order: Json): number {
  const expires = str(order.expires_at);
  if (expires) {
    const ms = new Date(expires).getTime() - Date.now();
    if (Number.isFinite(ms) && ms > 60_000) return Math.round(ms / 1000);
  }
  return DEFAULT_SESSION_SECONDS;
}

/** A status that means the order ended without a number to sell. */
function terminalFailure(status: string | null): string | null {
  return status && /^(failed|cancelled|canceled|expired)$/i.test(status) ? status.toLowerCase() : null;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** DogeSMS's order states as the shared status every order uses. */
export function toOrderStatus(state: StoredOrderState | null): ProviderOrderStatus {
  const status = state?.status?.toLowerCase() ?? "pending";
  if (status === "completed" && state?.code) {
    return { state: "received", code: state.code, ...(state.text ? { text: state.text } : {}) };
  }
  // DogeSMS refunds an expired order itself and keeps no charge on a failed one.
  if (status === "expired" || status === "failed") return { state: "refunded" };
  if (status === "cancelled" || status === "canceled") return { state: "cancelled" };
  return { state: "waiting" };
}
