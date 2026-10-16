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
  type CatalogSnapshot,
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

/** DogeSMS refused a request with HTTP 429 (too many requests). */
export class DogeSmsRateLimitedError extends ProviderError {
  constructor(
    message: string,
    /** How long DogeSMS asked to wait (its Retry-After header), when given. */
    readonly retryAfterMs: number | null,
  ) {
    super(message, "rejected");
  }
}

const DEFAULT_API_ORIGIN = "https://api.dogesms.com";
const REQUEST_TIMEOUT_MS = 12_000;
/** Catalog reads (service list, country list, one country's prices) are
 *  slow on DogeSMS's side: the service list is 130 KB and took up to
 *  several seconds, a country's prices up to 11 s in production. A 12 s
 *  limit cut the service list off mid-answer and failed the whole sync. */
const CATALOG_TIMEOUT_MS = 20_000;
/** A catalog request started this close to a sync's deadline is cut short
 *  rather than allowed to run past it, so the whole request still ends
 *  inside the platform's 60-second limit. */
const MIN_CATALOG_TIMEOUT_MS = 3_000;
/** A live price check for one country, while a customer waits for a quote:
 *  shorter than a sync's, so a slow DogeSMS does not hold the page up. */
const LIVE_PRICE_TIMEOUT_MS = 9_000;
/** The saved copy of the service and country lists is used without asking
 *  DogeSMS again for this long, and as a fallback when DogeSMS is too slow
 *  to answer for much longer than that. */
const STORED_CATALOG_FRESH_MS = 6 * 60 * 60 * 1000;
const STORED_CATALOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const STORED_CATALOG_KEY = "dogesms_catalog_v1";
const CATALOG_TTL_MS = 10 * 60 * 1000;
/** How long a purchase waits for DogeSMS to allocate a number when the
 *  order is created before one is ready. */
const DEFAULT_ALLOCATION_WAIT_MS = 15_000;
const ALLOCATION_POLL_MS = 1_000;
/** DogeSMS's countdown is "typically 5–20 minutes depending on the channel".
 *  The longest is used so Xencodes never gives up on an order DogeSMS is
 *  still serving; an earlier end arrives as order.expired. */
const DEFAULT_SESSION_SECONDS = 20 * 60;
/** How many countries' prices a sync asks for at once. DogeSMS needs one
 *  request per country and rate-limits them (HTTP 429): ten at a time was
 *  refused within a second in production. After the first 429 the sync
 *  drops to one at a time and waits as DogeSMS asks. */
const SNAPSHOT_CONCURRENCY = 8;
/** How often one country is retried after a 429 before it counts as failed
 *  for this run (its previous rows are kept). */
const MAX_RATE_LIMIT_RETRIES = 3;
/** A run that is refused this many times in a row stops early: going on
 *  would only lengthen DogeSMS's limit. The rest wait for the next run. */
const MAX_CONSECUTIVE_RATE_LIMITS = 5;
const MAX_COOLDOWN_MS = 20_000;
const BALANCE_ATTEMPTS = 6;
const BALANCE_TIMEOUT_MS = 6_000;
const BALANCE_MAX_WAIT_MS = 6_000;

export const DOGESMS_PROVIDER_ID = "dogesms";

/** Read first when nothing has been synced yet: where most orders are. */
const POPULAR_COUNTRIES = [
  "usa", "united-kingdom", "canada", "nigeria", "india", "germany", "france", "spain", "brazil",
  "australia", "indonesia", "philippines", "south-africa", "kenya", "ghana", "mexico", "italy",
  "netherlands", "poland", "ukraine", "russia", "turkey", "egypt", "vietnam", "thailand",
];

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
  /** Where the service and country lists are saved between requests. */
  catalogStore?: CatalogStore | null;
}

/** The raw service and country answers, saved so a slow DogeSMS does not
 *  stop a sync that only needs these lists to know what to ask about. */
export interface StoredCatalog {
  servicesRaw: unknown;
  countriesRaw: unknown;
  at: number;
}
export interface CatalogStore {
  read(): Promise<StoredCatalog | null>;
  write(value: StoredCatalog): Promise<void>;
}

/** Saves the lists in the settings table. */
export const settingsCatalogStore: CatalogStore = {
  async read() {
    const row = await prisma.setting.findUnique({ where: { key: STORED_CATALOG_KEY } });
    if (!row) return null;
    try {
      const value = JSON.parse(row.value) as StoredCatalog;
      return value && typeof value.at === "number" && value.servicesRaw && value.countriesRaw ? value : null;
    } catch {
      return null;
    }
  },
  async write(value) {
    const data = JSON.stringify(value);
    await prisma.setting.upsert({
      where: { key: STORED_CATALOG_KEY },
      create: { key: STORED_CATALOG_KEY, value: data },
      update: { value: data },
    });
  },
};

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
  private readonly catalogStore: CatalogStore | null;

  private static catalog: CatalogCache | null = null;
  /** our country slug -> that country's prices, by our service slug */
  private static prices = new Map<string, { table: PriceTable; at: number }>();
  private static blocked: Array<{ name: string; slug: string; category: string; term: string }> = [];
  /** Flipped off the first time the status endpoint says it is disabled. */
  private static statusQueriesWork = true;
  /** No catalog request is sent before this (epoch ms): set when DogeSMS
   *  answers 429, so this instance stops adding to the limit. */
  private static cooldownUntil = 0;

  constructor(options: DogeSmsOptions) {
    this.apiKey = options.apiKey;
    this.origin = options.apiOrigin ?? DEFAULT_API_ORIGIN;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.readOrderState = options.readOrderState ?? readDogeSmsOrderState;
    this.directory = options.directory ?? loadHouseDirectory;
    this.allocationWaitMs = options.allocationWaitMs ?? DEFAULT_ALLOCATION_WAIT_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.newIdempotencyKey = options.newIdempotencyKey ?? randomUUID;
    this.catalogStore = options.catalogStore ?? null;
  }

  /** For tests: forget the cached catalog and learned behaviour. */
  static resetForTests() {
    DogeSmsProvider.catalog = null;
    DogeSmsProvider.prices = new Map();
    DogeSmsProvider.blocked = [];
    DogeSmsProvider.statusQueriesWork = true;
    DogeSmsProvider.cooldownUntil = 0;
  }

  // ---------------------------------------------------------------- HTTP

  private async request(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string>; body?: Json; idempotencyKey?: string; timeoutMs?: number } = {},
  ): Promise<{ status: number; body: unknown; retryAfterMs: number | null }> {
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
    let text: string;
    try {
      const signal = AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
      response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal,
      });
      // The answer's body is read under the same limit: a reply whose headers
      // arrive and whose body stalls must fail like any other timeout, not
      // escape as a raw error.
      text = await response.text();
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      console.error(`[dogesms] <- ${method} ${path} ${timedOut ? "timed out" : "failed"} after ${Date.now() - startedAt}ms`);
      throw new ProviderError(timedOut ? "DogeSMS did not respond in time." : "DogeSMS could not be reached.", "network");
    }
    console.log(`[dogesms] <- ${method} ${path} HTTP ${response.status}, ${text.length} bytes, ${Date.now() - startedAt}ms`);
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body, retryAfterMs: parseRetryAfter(response.headers.get("retry-after")) };
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

  private async getJson(path: string, query?: Record<string, string>, timeoutMs = CATALOG_TIMEOUT_MS): Promise<unknown> {
    const { status, body, retryAfterMs } = await this.request("GET", path, { query, timeoutMs });
    if (status === 429) {
      DogeSmsProvider.cooldownUntil = Math.max(
        DogeSmsProvider.cooldownUntil,
        Date.now() + Math.min(retryAfterMs ?? 2_000, MAX_COOLDOWN_MS),
      );
      throw new DogeSmsRateLimitedError(this.errorFor(status, body, `GET ${path}`).message, retryAfterMs);
    }
    if (status < 200 || status >= 300) throw this.errorFor(status, body, `GET ${path}`);
    return unwrap(body);
  }

  // ------------------------------------------------------------- catalog

  private async loadCatalog(force = false): Promise<CatalogCache> {
    const current = DogeSmsProvider.catalog;
    if (!force && current && Date.now() - current.at < CATALOG_TTL_MS) return current;

    const { servicesRaw, countriesRaw, directory } = await this.readCatalogLists(force);

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

  /**
   * The service and country lists: the saved copy while it is under six
   * hours old (they change rarely, and DogeSMS is slow to send them), else
   * fresh from DogeSMS and saved. When DogeSMS cannot answer, a saved copy up
   * to a week old keeps a sync going: the lists only say what to ask about,
   * every price still comes fresh.
   */
  private async readCatalogLists(force: boolean) {
    const directory = await this.directory().catch(() => ({
      countrySlugByIso2: new Map(),
      serviceSlugs: new Set<string>(),
    }));
    const stored = await this.catalogStore?.read().catch(() => null);
    const age = stored ? Date.now() - stored.at : Infinity;
    if (stored && age < STORED_CATALOG_FRESH_MS && !force) {
      return { servicesRaw: stored.servicesRaw, countriesRaw: stored.countriesRaw, directory };
    }
    try {
      const [servicesRaw, countriesRaw] = await Promise.all([
        this.getJson("/v1/catalog/services"),
        this.getJson("/v1/catalog/countries"),
      ]);
      await this.catalogStore?.write({ servicesRaw, countriesRaw, at: Date.now() }).catch((error) => {
        console.error("[dogesms] could not save the catalog lists:", error instanceof Error ? error.message : error);
      });
      return { servicesRaw, countriesRaw, directory };
    } catch (error) {
      if (stored && age < STORED_CATALOG_MAX_AGE_MS) {
        console.error(
          `[dogesms] catalog lists unavailable (${error instanceof Error ? error.message : "error"}); using the copy saved ${Math.round(age / 60000)} min ago`,
        );
        return { servicesRaw: stored.servicesRaw, countriesRaw: stored.countriesRaw, directory };
      }
      throw error;
    }
  }

  /** One country's prices, from cache unless `fresh`. */
  private async pricesFor(
    catalog: CatalogCache,
    countrySlug: string,
    fresh = false,
    timeoutMs = CATALOG_TIMEOUT_MS,
  ): Promise<PriceTable | null> {
    const country = catalog.countries.get(countrySlug);
    if (!country) return null;
    const cached = DogeSmsProvider.prices.get(countrySlug);
    if (!fresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.table;
    const table = this.parsePrices(
      await this.getJson("/v1/catalog/prices", { country_code: country.code }, timeoutMs),
      catalog.codeToSlug,
    );
    DogeSmsProvider.prices.set(countrySlug, { table, at: Date.now() });
    return table;
  }

  /**
   * As many countries' prices as can be read before `deadline`, in
   * `countryOrder` first (countries not in it, never synced, go first of
   * all). A few at a time; after a 429 one at a time, waiting as DogeSMS
   * asks, retrying that country a few times. Countries not reached are
   * simply not reported: the sync keeps their previous rows.
   */
  async getCatalogSnapshot(options: { deadline: number; countryOrder?: string[] }): Promise<CatalogSnapshot> {
    const { deadline } = options;
    const catalog = await this.loadCatalog(false);
    const all = [...catalog.countries.keys()];
    const rank = new Map((options.countryOrder ?? []).map((slug, index) => [slug, index]));
    // Never-synced countries first, the best-known ones before the rest;
    // then the ones synced longest ago.
    const popular = new Map(POPULAR_COUNTRIES.map((slug, index) => [slug, index]));
    const queue = [...all].sort((a, b) => {
      const ra = rank.get(a) ?? -1;
      const rb = rank.get(b) ?? -1;
      if (ra !== rb) return ra - rb;
      return (popular.get(a) ?? 1e6) - (popular.get(b) ?? 1e6);
    });

    const entries: ProviderCatalogEntry[] = [];
    const read: string[] = [];
    const failed: string[] = [];
    const retries = new Map<string, number>();
    // How many of the workers below may still take a country. After a 429
    // only the first goes on, one at a time.
    let allowed = SNAPSHOT_CONCURRENCY;
    let consecutiveLimits = 0;
    let rateLimited = false;
    let stop = false;

    // A rolling set of requests, not groups: DogeSMS's answers take anywhere
    // from 0.3 to 9 seconds, and a group waits for its slowest, so one slow
    // country used to hold up the other four.
    let inFlight = 0;
    const worker = async (index: number) => {
      while (!stop && index < allowed && Date.now() < deadline) {
        if (queue.length === 0) {
          // Nothing left to take, but a request still running may be refused
          // and put its country back: stay until none is.
          if (inFlight === 0) return;
          await new Promise((resolve) => setTimeout(resolve, 20));
          continue;
        }
        const wait = DogeSmsProvider.cooldownUntil - Date.now();
        if (wait > 0) {
          if (Date.now() + wait >= deadline) return;
          await this.sleep(wait);
        }
        const slug = queue.shift();
        if (!slug) continue;
        inFlight += 1;
        try {
          // Cut short at the deadline rather than allowed to run past it.
          const timeoutMs = Math.max(MIN_CATALOG_TIMEOUT_MS, Math.min(CATALOG_TIMEOUT_MS, deadline - Date.now()));
          const table = await this.pricesFor(catalog, slug, true, timeoutMs);
          read.push(slug);
          if (table) entries.push(...this.entriesFor(catalog, slug, table));
          consecutiveLimits = 0;
        } catch (error) {
          if (error instanceof DogeSmsRateLimitedError) {
            rateLimited = true;
            allowed = 1;
            consecutiveLimits += 1;
            const tries = (retries.get(slug) ?? 0) + 1;
            retries.set(slug, tries);
            if (tries > MAX_RATE_LIMIT_RETRIES) failed.push(slug);
            else queue.unshift(slug);
            const backoff = Math.min(2_000 * 2 ** (consecutiveLimits - 1), MAX_COOLDOWN_MS);
            DogeSmsProvider.cooldownUntil = Math.max(DogeSmsProvider.cooldownUntil, Date.now() + backoff);
            if (consecutiveLimits >= MAX_CONSECUTIVE_RATE_LIMITS) stop = true;
          } else if (error instanceof ProviderError && error.code === "rejected" && /HTTP (400|404|422)\b/.test(error.message)) {
            // DogeSMS refuses this country outright (it will never have a
            // price table). Count it as read, with no offers, or the sync
            // could never reach "every country current".
            read.push(slug);
            consecutiveLimits = 0;
            console.warn(`[dogesms] ${slug} has no price table: ${error.message}`);
          } else {
            failed.push(slug);
            console.error(`[dogesms] prices for ${slug} failed:`, error instanceof Error ? error.message : error);
          }
        } finally {
          inFlight -= 1;
        }
      }
    };
    await Promise.all(Array.from({ length: SNAPSHOT_CONCURRENCY }, (_, index) => worker(index)));

    if (rateLimited) {
      console.log(`[dogesms] catalog read was rate limited: ${read.length}/${all.length} countries read this run`);
    }
    return {
      entries,
      countriesRead: read,
      countriesFailed: failed,
      countriesTotal: all.length,
      allCountries: all,
      rateLimited,
    };
  }

  private entriesFor(catalog: CatalogCache, countrySlug: string, prices: PriceTable): ProviderCatalogEntry[] {
    const country = catalog.countries.get(countrySlug);
    if (!country) return [];
    return [...prices].flatMap(([serviceSlug, price]) => {
      const service = catalog.services.get(serviceSlug);
      if (!service) return [];
      return [
        {
          service: service.service,
          country: country.country,
          costUsdCents: price.costUsdCents,
          stock: price.stockCount !== undefined && price.stockCount < 10 ? ("low" as const) : ("in_stock" as const),
          ...(price.stockCount !== undefined ? { stockCount: price.stockCount } : {}),
        },
      ];
    });
  }

  /** What the last syncs stored for Server II (see provider-sync.ts). Reads
   *  that cover every country come from here, never from DogeSMS live: one
   *  page view must not send a request per country. */
  private async syncedRows(where: { serviceSlug?: string } = {}) {
    return prisma.syncedOffer.findMany({
      where: { providerId: DOGESMS_PROVIDER_ID, ...where },
      select: {
        serviceSlug: true, countrySlug: true, countryName: true, countryFlag: true, dialCode: true,
        nationalDigits: true, costUsdCents: true, stock: true, stockCount: true,
      },
    });
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

  /** Every country this service is sold in, from the last syncs. */
  async getCountries(serviceSlug: string): Promise<ProviderAvailability[]> {
    const rows = await this.syncedRows({ serviceSlug });
    return rows.map((row) => ({
      serviceSlug,
      country: {
        slug: row.countrySlug,
        name: row.countryName,
        flag: row.countryFlag,
        dialCode: row.dialCode,
        nationalDigits: row.nationalDigits,
      },
      costUsdCents: row.costUsdCents,
      stock: row.stock === "low" ? "low" : "in_stock",
      ...(row.stockCount !== null && row.stockCount !== undefined ? { stockCount: row.stockCount } : {}),
    }));
  }

  /** Fresh: one price call for this country, no cache. */
  async getAvailability(serviceSlug: string, countrySlug: string): Promise<ProviderAvailability | null> {
    const catalog = await this.loadCatalog();
    if (!catalog.countries.has(countrySlug) || !catalog.services.has(serviceSlug)) return null;
    return this.availabilityFor(catalog, serviceSlug, countrySlug, await this.pricesFor(catalog, countrySlug, true, LIVE_PRICE_TIMEOUT_MS));
  }

  async getFullCatalog(): Promise<ProviderCatalogEntry[]> {
    return (await this.getCatalogSnapshot({ deadline: Date.now() + 45_000 })).entries;
  }

  async getCheapestCostByService(): Promise<Map<string, number>> {
    const cheapest = new Map<string, number>();
    for (const row of await this.syncedRows()) {
      const known = cheapest.get(row.serviceSlug);
      if (known === undefined || row.costUsdCents < known) cheapest.set(row.serviceSlug, row.costUsdCents);
    }
    return cheapest;
  }

  async getCountryCount(): Promise<number> {
    return new Set((await this.syncedRows()).map((row) => row.countrySlug)).size;
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
    // A balance read is one small request, but it shares DogeSMS's rate limit
    // with the price reads (and with other server instances running a sync,
    // which this instance's own cooldown cannot see). So a refusal is only a
    // busy moment: wait it out, with a growing pause, and ask again.
    let lastError: unknown;
    for (let attempt = 0; attempt < BALANCE_ATTEMPTS; attempt += 1) {
      const wait = Math.max(DogeSmsProvider.cooldownUntil - Date.now(), attempt === 0 ? 0 : 1_000 * 2 ** (attempt - 1));
      if (wait > 0) await this.sleep(Math.min(wait, BALANCE_MAX_WAIT_MS));
      try {
        const data = (await this.getJson("/v1/balance", undefined, BALANCE_TIMEOUT_MS)) as Json | null;
        return data ? int(data.balance_cents) : null;
      } catch (error) {
        lastError = error;
        if (!(error instanceof DogeSmsRateLimitedError)) throw error;
      }
    }
    throw lastError;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const cents = await this.getProviderBalanceUsdCents();
      return { ok: true, message: cents === null ? "Connected." : `Connected. Balance $${(cents / 100).toFixed(2)}.` };
    } catch (error) {
      // Refused for going too fast means DogeSMS answered and the key is
      // accepted: reachable, just busy.
      if (error instanceof DogeSmsRateLimitedError) return { ok: true, message: "Connected (DogeSMS is busy; balance read later)." };
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

/** "+" and digits only, the same shape Server I's numbers have, so every
 *  number is shown and copied the same way. */
function normalizePhone(phone: string): string {
  return `+${phone.replace(/[^\d]/g, "")}`;
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

/** Retry-After as milliseconds: seconds, or an HTTP date. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}
