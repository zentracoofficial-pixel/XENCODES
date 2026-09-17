import {
  ProviderError,
  type NumberProvider,
  type ProviderAvailability,
  type ProviderOrderStatus,
  type ProviderService,
  type PurchasedNumber,
  type StockLevel,
} from "./types";
import { resolveCountryMeta, slugify } from "./country-meta";

/**
 * GrizzlySMS, the live number supplier.
 *
 * GrizzlySMS runs the same public wire format as the wider SMS-Activate
 * compatible ecosystem: one endpoint, an `action` query parameter, and
 * mostly plain-text responses rather than uniform JSON. Confirmed directly
 * from GrizzlySMS's own published API client (its official CLI tool, whose
 * source comments it as talking only to "the official API", names exactly
 * these actions with exactly these parameters) and cross-checked against
 * the published Python client on PyPI, which returns the same error codes
 * (BAD_KEY, BAD_SERVICE, BAD_COUNTRY, NO_NUMBERS) for the same calls.
 *
 * Two things could not be confirmed against a live response from inside
 * this environment, because outbound access to grizzlysms.com is blocked
 * here the same way it was for the previous supplier: the exact response
 * shape of getServicesList, and GrizzlySMS's default activation session
 * length when the number itself does not report one. Both are handled
 * defensively below (tolerant parsing that throws rather than guesses on
 * an unrecognised shape; a documented fallback duration used only when the
 * live response omits timing). Both are flagged in the final report as the
 * one thing to confirm against a real response once this is deployed
 * somewhere that can actually reach the API.
 */

const API_ORIGIN = "https://api.grizzlysms.com";
const HANDLER_PATH = "/stubs/handler_api.php";

/** Used only if a purchase response omits its own timing, which the
 *  confirmed getNumberV2 shape does not appear to do in the documentation
 *  found for this API family. Kept as an explicit fallback, not a silent
 *  assumption: 20 minutes is the long-standing default session length
 *  across this API family for the first code, per its public docs. */
const FALLBACK_SESSION_SECONDS = 20 * 60;

/** How long a fetched catalog (service names, country names) is trusted
 *  before asking again. Availability and cost are never cached this way:
 *  see getAvailability(). */
const CATALOG_TTL_MS = 5 * 60 * 1000;
/** getCountries() is allowed to be a little stale per the NumberProvider
 *  contract; this keeps a busy service's picker fast without holding a
 *  price long enough to matter. */
const PRICE_LIST_TTL_MS = 90 * 1000;

interface ServiceEntry {
  code: string;
  name: string;
}

interface CachedAt<T> {
  value: T;
  fetchedAt: number;
}

function isFresh(entry: CachedAt<unknown> | undefined, ttlMs: number) {
  return entry !== undefined && Date.now() - entry.fetchedAt < ttlMs;
}

/** GrizzlySMS's cost fields are USD, matching every reseller in this API
 *  family except the original .ru site. Converted here, once, so nothing
 *  downstream ever sees a dollar figure. */
function usdToKobo(usd: number, usdToNgnRate: number) {
  return Math.round(usd * usdToNgnRate * 100);
}

function stockFromCount(count: number): StockLevel {
  if (count <= 0) return "out_of_stock";
  if (count <= 5) return "low";
  return "in_stock";
}

/**
 * Parses a plain-text `KEY:value:value` response, the shape most actions in
 * this API family use instead of JSON. Returns null on a response that does
 * not start with the key it was asked for, so callers can fall through to
 * error handling instead of misreading an error string as data.
 */
function parseColonResponse(text: string, expectedKey: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(`${expectedKey}:`)) return null;
  return trimmed.split(":").slice(1);
}

const ERROR_MESSAGES: Record<string, string> = {
  BAD_KEY: "GrizzlySMS rejected the API key.",
  BAD_SERVICE: "GrizzlySMS does not recognise that service.",
  BAD_COUNTRY: "GrizzlySMS does not recognise that country.",
  NO_NUMBERS: "No numbers available for that pair right now.",
  NO_BALANCE: "The GrizzlySMS account balance is too low to buy this number.",
  ERROR_SQL: "GrizzlySMS reported a server error.",
  NO_ACTIVATION: "GrizzlySMS does not recognise that order.",
  BAD_STATUS: "GrizzlySMS rejected that status change.",
};

export class GrizzlySmsProvider implements NumberProvider {
  readonly id = "grizzlysms";
  readonly label = "GrizzlySMS";

  private readonly apiKey: string;
  private readonly usdToNgnRate: number;

  /**
   * Static, not per-instance. getNumberProvider() builds a fresh
   * GrizzlySmsProvider on every call (see provider/index.ts), so caching
   * on `this` would reset on every single request and never actually
   * cache anything. GrizzlySMS's catalog and price lists are the same
   * regardless of which instance asks, so the cache belongs to the class
   * (in effect, the module), where it survives across instances for as
   * long as this serverless function stays warm.
   */
  private static servicesCache?: CachedAt<ServiceEntry[]>;
  private static countriesCache?: CachedAt<Map<string, string>>; // slug -> provider id
  private static countryNamesCache?: Map<string, string>; // provider id -> display name
  private static priceListCache = new Map<
    string,
    CachedAt<Map<string, Map<string, { cost: number; count: number }>>>
  >();

  constructor(config: { apiKey: string; usdToNgnRate: number }) {
    this.apiKey = config.apiKey;
    this.usdToNgnRate = config.usdToNgnRate;
  }

  /** Every call to the handler endpoint. Never logs the key, and the key
   *  never appears in anything this method returns to a caller: only the
   *  parsed body does. */
  private async call(params: Record<string, string>): Promise<string> {
    const url = new URL(HANDLER_PATH, API_ORIGIN);
    url.searchParams.set("api_key", this.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let response: Response;
    try {
      response = await fetch(url.toString(), { cache: "no-store" });
    } catch (error) {
      throw new ProviderError(
        `GrizzlySMS request failed: ${error instanceof Error ? error.message : "network error"}`,
        "network",
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw new ProviderError(
        `GrizzlySMS returned HTTP ${response.status} for action "${params.action}".`,
        "network",
      );
    }
    return text;
  }

  private async callJson(params: Record<string, string>): Promise<unknown> {
    const text = await this.call(params);
    try {
      return JSON.parse(text);
    } catch {
      // A JSON action answering with a bare error code (BAD_KEY, and so on)
      // is exactly as real an outcome as a malformed body, so both are
      // reported the same way rather than one being swallowed.
      throw new ProviderError(
        ERROR_MESSAGES[text.trim()] ??
          `GrizzlySMS returned a non-JSON response for action "${params.action}": ${text.slice(0, 200)}`,
        ERROR_MESSAGES[text.trim()] ? "rejected" : "unknown",
      );
    }
  }

  /**
   * The full service catalog, by code. getServicesList's exact response
   * shape is the one thing about this adapter not confirmed against a real
   * reply (see the file header), so this parses tolerantly across the
   * handful of shapes this API family is known to use for list endpoints,
   * an array of {code, name} style objects or an object keyed by code.
   *
   * If that still does not match, this falls back to the service codes
   * that actually appear in getPrices, whose shape is well confirmed,
   * rather than making every search and every purchase depend on the one
   * endpoint this adapter is least sure about. In that fallback a
   * service's "name" is its own provider code (for example "wa" rather
   * than "WhatsApp"): less readable, but still a real, live, purchasable
   * service, which is the honest trade to make rather than either
   * fabricating a friendly name or refusing to list anything at all.
   */
  private async loadServices(): Promise<ServiceEntry[]> {
    if (isFresh(GrizzlySmsProvider.servicesCache, CATALOG_TTL_MS)) return GrizzlySmsProvider.servicesCache!.value;

    let entries: ServiceEntry[] | null = null;
    try {
      const data = await this.callJson({ action: "getServicesList" });
      entries = parseServiceEntries(data);
      if (!entries) {
        console.error(
          "[grizzlysms] getServicesList returned an unrecognised shape, falling back to codes from getPrices.",
        );
      }
    } catch (error) {
      console.error(
        "[grizzlysms] getServicesList failed, falling back to codes from getPrices:",
        error,
      );
    }

    if (!entries) entries = await this.loadServiceCodesFromPrices();
    if (entries.length === 0) {
      throw new ProviderError(
        "GrizzlySMS returned no services from either getServicesList or getPrices.",
        "unknown",
      );
    }

    GrizzlySmsProvider.servicesCache = { value: entries, fetchedAt: Date.now() };
    return entries;
  }

  private async loadServiceCodesFromPrices(): Promise<ServiceEntry[]> {
    const prices = await this.fetchPrices({});
    const codes = new Set<string>();
    for (const byService of prices.values()) {
      for (const code of byService.keys()) codes.add(code);
    }
    return Array.from(codes).map((code) => ({ code, name: code }));
  }

  /** Every country GrizzlySMS knows, mapped from its own id to a display
   *  name. Confirmed shape: an object keyed by numeric id, each value
   *  carrying at least an English name. */
  private async loadCountries(): Promise<{ idToName: Map<string, string> }> {
    if (isFresh(GrizzlySmsProvider.countriesCache, CATALOG_TTL_MS)) {
      return { idToName: GrizzlySmsProvider.countryNamesCache! };
    }

    const data = await this.callJson({ action: "getCountries" });
    const idToName = parseCountryEntries(data);
    if (!idToName) {
      throw new ProviderError(
        "GrizzlySMS returned an unrecognised shape for getCountries.",
        "unknown",
      );
    }

    const slugToId = new Map<string, string>();
    for (const [id, name] of idToName) {
      slugToId.set(resolveCountryMeta(name).slug, id);
    }

    GrizzlySmsProvider.countriesCache = { value: slugToId, fetchedAt: Date.now() };
    GrizzlySmsProvider.countryNamesCache = idToName;
    return { idToName };
  }

  private async resolveServiceCode(serviceSlug: string): Promise<string | null> {
    const services = await this.loadServices();
    const match = services.find((s) => slugify(s.name) === serviceSlug);
    return match?.code ?? null;
  }

  private async resolveCountryId(countrySlug: string): Promise<string | null> {
    if (!isFresh(GrizzlySmsProvider.countriesCache, CATALOG_TTL_MS)) await this.loadCountries();
    for (const [id, name] of GrizzlySmsProvider.countryNamesCache ?? []) {
      if (resolveCountryMeta(name).slug === countrySlug) return id;
    }
    return null;
  }

  /**
   * getPrices, scoped as tightly as the caller allows. Country-scoped
   * results are cached briefly per the NumberProvider contract for
   * getCountries(); a pair-scoped call always bypasses that cache, because
   * getAvailability() must never trust anything but a fresh answer.
   */
  private async fetchPrices(params: {
    serviceCode?: string;
    countryId?: string;
    fresh?: boolean;
  }): Promise<Map<string, Map<string, { cost: number; count: number }>>> {
    const cacheKey = `${params.serviceCode ?? "*"}::${params.countryId ?? "*"}`;
    if (!params.fresh) {
      const cached = GrizzlySmsProvider.priceListCache.get(cacheKey);
      if (isFresh(cached, PRICE_LIST_TTL_MS)) return cached!.value;
    }

    const query: Record<string, string> = { action: "getPrices" };
    if (params.serviceCode) query.service = params.serviceCode;
    if (params.countryId) query.country = params.countryId;

    const data = await this.callJson(query);
    const parsed = parsePricesResponse(data);
    if (!parsed) {
      throw new ProviderError(
        "GrizzlySMS returned an unrecognised shape for getPrices.",
        "unknown",
      );
    }

    if (!params.fresh) {
      GrizzlySmsProvider.priceListCache.set(cacheKey, { value: parsed, fetchedAt: Date.now() });
    }
    return parsed;
  }

  async getServices(): Promise<ProviderService[]> {
    const services = await this.loadServices();
    return services.map((service) => ({
      slug: slugify(service.name),
      name: service.name,
      color: "#63756F",
      category: "All services",
      providerServiceId: service.code,
    }));
  }

  async getCountries(serviceSlug: string): Promise<ProviderAvailability[]> {
    const [code, { idToName }] = await Promise.all([
      this.resolveServiceCode(serviceSlug),
      this.loadCountries(),
    ]);
    if (!code) return [];

    const prices = await this.fetchPrices({ serviceCode: code });
    const byCountry: ProviderAvailability[] = [];

    for (const [countryId, byService] of prices) {
      const entry = byService.get(code);
      if (!entry) continue;
      const name = idToName.get(countryId);
      if (!name) continue;

      byCountry.push({
        serviceSlug,
        country: resolveCountryMeta(name),
        costKobo: usdToKobo(entry.cost, this.usdToNgnRate),
        stock: stockFromCount(entry.count),
        stockCount: entry.count,
      });
    }

    return byCountry;
  }

  async getAvailability(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<ProviderAvailability | null> {
    const [code, countryId] = await Promise.all([
      this.resolveServiceCode(serviceSlug),
      this.resolveCountryId(countrySlug),
    ]);
    if (!code || !countryId) return null;

    // Fresh, uncached: this is the figure a purchase is about to be
    // validated against.
    const prices = await this.fetchPrices({ serviceCode: code, countryId, fresh: true });
    const entry = prices.get(countryId)?.get(code);
    if (!entry) return null;

    const name = GrizzlySmsProvider.countryNamesCache?.get(countryId);
    if (!name) return null;

    return {
      serviceSlug,
      country: resolveCountryMeta(name),
      costKobo: usdToKobo(entry.cost, this.usdToNgnRate),
      stock: stockFromCount(entry.count),
      stockCount: entry.count,
    };
  }

  async purchaseNumber(
    serviceSlug: string,
    countrySlug: string,
    maxCostKobo?: number,
  ): Promise<PurchasedNumber> {
    const [code, countryId] = await Promise.all([
      this.resolveServiceCode(serviceSlug),
      this.resolveCountryId(countrySlug),
    ]);
    if (!code || !countryId) {
      throw new ProviderError("Unknown service or country.", "rejected");
    }

    const params: Record<string, string> = {
      action: "getNumberV2",
      service: code,
      country: countryId,
    };
    // The additional provider-side safety rail: if the live price has
    // risen past what Xencodes already quoted the customer, GrizzlySMS
    // itself refuses the request rather than this purchase silently
    // costing more than the order it is about to be attached to.
    if (maxCostKobo !== undefined) {
      const maxUsd = maxCostKobo / 100 / this.usdToNgnRate;
      params.maxPrice = maxUsd.toFixed(4);
    }

    // Read raw text rather than callJson(): a sold-out pair answers with the
    // plain error string "NO_NUMBERS", not JSON, and that specific outcome
    // needs its own error code so the buy flow can say "out of stock, try
    // another country" instead of a generic provider error.
    const text = await this.call(params);
    const trimmed = text.trim();
    if (trimmed === "NO_NUMBERS") {
      throw new ProviderError("No numbers available for that pair.", "out_of_stock");
    }
    if (ERROR_MESSAGES[trimmed]) {
      throw new ProviderError(ERROR_MESSAGES[trimmed], "rejected");
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ProviderError(
        `GrizzlySMS returned an unrecognised response for getNumberV2: ${text.slice(0, 200)}`,
        "unknown",
      );
    }

    const purchase = parsePurchaseResponse(data);
    if (!purchase) {
      throw new ProviderError(
        `GrizzlySMS returned an unrecognised shape for getNumberV2: ${text.slice(0, 200)}`,
        "unknown",
      );
    }

    return purchase;
  }

  async getOrderStatus(providerOrderId: string): Promise<ProviderOrderStatus> {
    const text = await this.call({ action: "getStatus", id: providerOrderId });
    const trimmed = text.trim();

    if (trimmed === "STATUS_WAIT_CODE" || trimmed.startsWith("STATUS_WAIT_RETRY")) {
      return { state: "waiting" };
    }
    if (trimmed === "STATUS_CANCEL") return { state: "cancelled" };
    if (trimmed.startsWith("STATUS_OK")) {
      const code = trimmed.split(":").slice(1).join(":");
      if (code) return { state: "received", code };
    }
    // NO_ACTIVATION and anything else unrecognised: the caller's own
    // session timeout is what settles an order this adapter cannot
    // explain, so waiting is the honest answer here rather than guessing
    // a specific outcome the provider did not actually report.
    return { state: "waiting" };
  }

  async cancelOrder(providerOrderId: string): Promise<void> {
    try {
      await this.call({ action: "setStatus", id: providerOrderId, status: "8" });
    } catch (error) {
      throw new ProviderError(
        `GrizzlySMS cancel failed: ${error instanceof Error ? error.message : "unknown error"}`,
        "unknown",
      );
    }
  }

  async getProviderBalanceKobo(): Promise<number | null> {
    try {
      const text = await this.call({ action: "getBalance" });
      const parts = parseColonResponse(text, "ACCESS_BALANCE");
      if (!parts || parts.length === 0) return null;
      const usd = Number(parts[0]);
      return Number.isFinite(usd) ? usdToKobo(usd, this.usdToNgnRate) : null;
    } catch {
      return null;
    }
  }

  getCatalogSyncedAt(): Date | null {
    return GrizzlySmsProvider.servicesCache
      ? new Date(GrizzlySmsProvider.servicesCache.fetchedAt)
      : null;
  }

  /**
   * The cheapest live cost per service, derived from one unfiltered
   * getPrices call rather than one call per service. That single payload
   * is cached the same way any other price list is (see fetchPrices), so
   * an admin page listing many services costs one provider request, not
   * one per row.
   */
  async getCheapestCostByService(): Promise<Map<string, number>> {
    const prices = await this.fetchPrices({});
    const cheapestUsdByCode = new Map<string, number>();

    for (const byService of prices.values()) {
      for (const [code, entry] of byService) {
        const current = cheapestUsdByCode.get(code);
        if (current === undefined || entry.cost < current) {
          cheapestUsdByCode.set(code, entry.cost);
        }
      }
    }

    const services = await this.loadServices();
    const result = new Map<string, number>();
    for (const service of services) {
      const usd = cheapestUsdByCode.get(service.code);
      if (usd !== undefined) {
        result.set(slugify(service.name), usdToKobo(usd, this.usdToNgnRate));
      }
    }
    return result;
  }

  /**
   * Reuses the same unfiltered getPrices call as getCheapestCostByService
   * (same cache entry, so calling both in one request costs one HTTP call
   * between them, not two). A country only appears in that response with
   * at least one service actually priced in it, so its key count is
   * exactly "countries with something in stock right now".
   */
  async getCountryCount(): Promise<number> {
    const prices = await this.fetchPrices({});
    return prices.size;
  }
}

// ---- Response parsing -------------------------------------------------
//
// Kept separate from the class body and individually testable: each of
// these is the one place a shape assumption about GrizzlySMS's JSON lives,
// and each fails by returning null (not by fabricating a plausible-looking
// result) when the real response does not match.

function parseServiceEntries(data: unknown): ServiceEntry[] | null {
  if (Array.isArray(data)) {
    const entries = data.flatMap((row) => {
      if (typeof row !== "object" || row === null) return [];
      const record = row as Record<string, unknown>;
      const code = record.code ?? record.id ?? record.service;
      const name = record.name ?? record.title ?? record.service_name;
      if (typeof code !== "string" || typeof name !== "string") return [];
      return [{ code, name }];
    });
    return entries.length > 0 ? entries : null;
  }

  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    // Some list endpoints in this family nest the real array under a key.
    const nested = record.services ?? record.data ?? record.list;
    if (Array.isArray(nested)) return parseServiceEntries(nested);

    // Otherwise treat the object itself as code -> name (or code -> {name}).
    const entries = Object.entries(record).flatMap(([code, value]) => {
      if (typeof value === "string") return [{ code, name: value }];
      if (typeof value === "object" && value !== null) {
        const name = (value as Record<string, unknown>).name;
        if (typeof name === "string") return [{ code, name }];
      }
      return [];
    });
    return entries.length > 0 ? entries : null;
  }

  return null;
}

function parseCountryEntries(data: unknown): Map<string, string> | null {
  if (typeof data !== "object" || data === null) return null;

  const result = new Map<string, string>();
  for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const name = record.eng ?? record.name ?? record.en;
    const numericId = record.id;
    const key = typeof numericId === "number" ? String(numericId) : id;
    if (typeof name === "string" && name.trim()) result.set(key, name);
  }

  return result.size > 0 ? result : null;
}

function parsePricesResponse(
  data: unknown,
): Map<string, Map<string, { cost: number; count: number }>> | null {
  if (typeof data !== "object" || data === null) return null;

  const result = new Map<string, Map<string, { cost: number; count: number }>>();
  for (const [countryId, byService] of Object.entries(data as Record<string, unknown>)) {
    if (typeof byService !== "object" || byService === null) continue;
    const inner = new Map<string, { cost: number; count: number }>();

    for (const [serviceCode, entry] of Object.entries(byService as Record<string, unknown>)) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const cost = Number(record.cost);
      const count = Number(record.count ?? record.quant ?? 0);
      if (Number.isFinite(cost) && cost > 0) {
        inner.set(serviceCode, { cost, count: Number.isFinite(count) ? count : 0 });
      }
    }

    if (inner.size > 0) result.set(countryId, inner);
  }

  return result.size > 0 ? result : null;
}

function parsePurchaseResponse(data: unknown): PurchasedNumber | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;

  const providerOrderId = record.activationId ?? record.id;
  const phoneNumber = record.phoneNumber ?? record.phone;
  if (
    (typeof providerOrderId !== "string" && typeof providerOrderId !== "number") ||
    typeof phoneNumber !== "string"
  ) {
    return null;
  }

  let sessionSeconds = FALLBACK_SESSION_SECONDS;
  const start = record.activationTime;
  const end = record.activationEndTime;
  if (typeof start === "string" && typeof end === "string") {
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    if (Number.isFinite(diffMs) && diffMs > 0) sessionSeconds = Math.round(diffMs / 1000);
  }

  const formattedNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;

  return {
    providerOrderId: String(providerOrderId),
    phoneNumber: formattedNumber,
    sessionSeconds,
  };
}
