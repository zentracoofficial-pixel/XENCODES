import {
  ProviderError,
  type NumberProvider,
  type ProviderAvailability,
  type ProviderCatalogEntry,
  type ProviderOrderStatus,
  type ProviderPool,
  type ProviderService,
  type PurchasedNumber,
  type StockLevel,
} from "./types";
import { resolveCountryMeta, slugify, assignVariantLabels } from "./country-meta";

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

/**
 * How long any single request to GrizzlySMS is allowed to hang before this
 * gives up on it. `fetch()` has no timeout of its own: a supplier that
 * accepts the connection but never answers (or answers very slowly under
 * load) would otherwise hold the request open indefinitely, which on a
 * serverless deployment means "Sync now" or a purchase attempt sits on
 * "loading" forever, with no error to react to, until the platform's own
 * function timeout kills it from outside with no useful message. A
 * deliberate, shorter timeout here turns that into a real ProviderError the
 * caller can show and retry.
 */
const REQUEST_TIMEOUT_MS = 20_000;

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
 *  family except the original .ru site. Converted to cents here, once, so
 *  nothing downstream ever sees a fractional-dollar figure; turning that USD
 *  cost into a customer's own currency is the pricing engine's job (see
 *  quoteForCurrency() in src/lib/pricing.ts), never this adapter's. */
function usdToCents(usd: number) {
  return Math.round(usd * 100);
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

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  /** Every call to the handler endpoint. Never logs the key, and the key
   *  never appears in anything this method returns to a caller: only the
   *  parsed body does. */
  private async call(params: Record<string, string>): Promise<string> {
    const url = new URL(HANDLER_PATH, API_ORIGIN);
    url.searchParams.set("api_key", this.apiKey);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const requestStartedAt = Date.now();
    console.log(`[grizzlysms] -> ${params.action}`);

    let response: Response;
    try {
      response = await fetch(url.toString(), { cache: "no-store", signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(
          `[grizzlysms] <- ${params.action} timed out after ${Date.now() - requestStartedAt}ms`,
        );
        throw new ProviderError(
          `GrizzlySMS did not respond to "${params.action}" within ${REQUEST_TIMEOUT_MS / 1000}s.`,
          "network",
        );
      }
      console.error(
        `[grizzlysms] <- ${params.action} failed after ${Date.now() - requestStartedAt}ms:`,
        error,
      );
      throw new ProviderError(
        `GrizzlySMS request failed: ${error instanceof Error ? error.message : "network error"}`,
        "network",
      );
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    console.log(
      `[grizzlysms] <- ${params.action} HTTP ${response.status}, ${text.length} bytes, ${Date.now() - requestStartedAt}ms`,
    );
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

  // slugify(name) is not guaranteed unique across a live catalog (two
  // differently-punctuated or differently-capitalised names can collide).
  // Silently taking the first match would risk a purchase resolving to the
  // wrong provider service/country with no trace of why, so a collision is
  // logged loudly instead — this cannot happen for the overwhelming
  // majority of real names, but a purchase is money moving and deserves a
  // paper trail on the rare case it does.
  private async resolveServiceCode(serviceSlug: string): Promise<string | null> {
    const services = await this.loadServices();
    const matches = services.filter((s) => slugify(s.name) === serviceSlug);
    if (matches.length > 1) {
      console.error(
        `[grizzlysms] slug "${serviceSlug}" matches ${matches.length} services: ` +
          `${matches.map((m) => `${m.name} (${m.code})`).join(", ")}. ` +
          "Using the first; verify this did not resolve to the wrong service.",
      );
    }
    return matches[0]?.code ?? null;
  }

  /**
   * Scoped to one exact service, because a "(N)" collision is only ever
   * meaningful among ids actually priced for that service (a service only
   * one of two same-named ids currently has stock for was never ambiguous
   * to begin with — see assignVariantLabels()'s own comment). Reproduces the
   * exact same labelling getCountries() applies when listing this service's
   * countries, so a slug this adapter itself synthesized for a second
   * same-named pool resolves back to the real id to buy, not a dead end —
   * see country-meta.ts's assignVariantLabels().
   *
   * Always a fresh, uncached price fetch, never the up-to-90-second
   * PRICE_LIST_TTL_MS snapshot getCountries() is content to browse against:
   * every current caller (getAvailability, purchaseNumber, getProviderPools)
   * is on the purchase-critical path, where a pair that just sold out or
   * just restocked must be reflected immediately. Candidates are built only
   * from entries actually present in this service's price list, so a pair
   * with zero current stock (parsePricesResponse drops any cost<=0 entry
   * entirely) genuinely has no candidate to resolve to here — but a stale
   * snapshot could still be missing a pair that has *since* restocked,
   * which is exactly the false "out of stock" a customer sees when
   * GrizzlySMS itself can already sell it again. See fetchPrices()'s own
   * comment on why a pair-scoped call bypasses the cache the same way.
   */
  private async resolveCountryId(
    serviceCode: string,
    countrySlug: string,
  ): Promise<{
    id: string;
    label: { slug: string; name: string };
    entry: { cost: number; count: number };
  } | null> {
    if (!isFresh(GrizzlySmsProvider.countriesCache, CATALOG_TTL_MS)) await this.loadCountries();
    const idToName = GrizzlySmsProvider.countryNamesCache ?? new Map<string, string>();

    const prices = await this.fetchPrices({ serviceCode, fresh: true });
    const candidates: Array<{ providerCountryId: string; name: string }> = [];
    for (const [countryId, byService] of prices) {
      if (!byService.has(serviceCode)) continue;
      const name = idToName.get(countryId);
      if (name) candidates.push({ providerCountryId: countryId, name });
    }

    const labels = assignVariantLabels(candidates);
    for (const [id, label] of labels) {
      if (label.slug === countrySlug) {
        // Guaranteed present: `id` only became a candidate above because
        // prices.get(id).has(serviceCode) was already true. Returned here
        // rather than re-fetched, so a caller never has to make a second
        // live request just to learn the cost/count of the exact id this
        // call already looked up — see getAvailability()'s own comment.
        return { id, label, entry: prices.get(id)!.get(serviceCode)! };
      }
    }
    return null;
  }

  /**
   * getPrices, scoped as tightly as the caller allows. Briefly cached per
   * the NumberProvider contract for getCountries(), which is allowed to be
   * a little stale; every purchase-critical caller (resolveCountryId, so in
   * turn getAvailability/purchaseNumber/getProviderPools) passes
   * `fresh: true` to always bypass that cache, since none of them may ever
   * trust anything but a live answer.
   */
  private async fetchPrices(params: {
    serviceCode?: string;
    fresh?: boolean;
  }): Promise<Map<string, Map<string, { cost: number; count: number }>>> {
    const cacheKey = params.serviceCode ?? "*";
    if (!params.fresh) {
      const cached = GrizzlySmsProvider.priceListCache.get(cacheKey);
      if (isFresh(cached, PRICE_LIST_TTL_MS)) return cached!.value;
    }

    const query: Record<string, string> = { action: "getPrices" };
    if (params.serviceCode) query.service = params.serviceCode;

    const data = await this.callJson(query);
    const parsed = parsePricesResponse(data, params.serviceCode);
    if (!parsed) {
      // Captured so the actual shape is visible in Vercel's logs on the
      // next attempt, rather than guessed at blind a third time. Trimmed:
      // an unfiltered catalog response can be large, and only the opening
      // structure is needed to identify the real shape.
      console.error(
        `[grizzlysms] getPrices unrecognised shape for query ${JSON.stringify(query)}. Raw response: ${JSON.stringify(data).slice(0, 3000)}`,
      );
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
    const raw: Array<{ countryId: string; name: string; cost: number; count: number }> = [];

    for (const [countryId, byService] of prices) {
      const entry = byService.get(code);
      if (!entry) continue;
      const name = idToName.get(countryId);
      if (!name) continue;
      raw.push({ countryId, name, cost: entry.cost, count: entry.count });
    }

    // Two of GrizzlySMS's own country ids can share the identical name — a
    // real, separately priced and stocked pool each (see
    // src/lib/country-variant.ts), not a duplicate. Labelled here, once, so
    // every caller of this method (the catalog sync, and inventory.ts's own
    // live fallback when the sync cache is stale) sees both rather than one
    // silently colliding with the other. See assignVariantLabels()'s own
    // comment in country-meta.ts.
    const labels = assignVariantLabels(raw.map((r) => ({ providerCountryId: r.countryId, name: r.name })));
    for (const r of raw) {
      const label = labels.get(r.countryId);
      if (label && label.name !== r.name) {
        console.error(
          `[grizzlysms] two distinct country ids both named "${r.name}" for "${serviceSlug}" ` +
            `(id ${r.countryId}) — keeping both rather than letting one silently win on price, ` +
            `labelling this one "${label.name}".`,
        );
      }
    }

    return raw.map((r) => {
      const label = labels.get(r.countryId)!;
      return {
        serviceSlug,
        country: { ...resolveCountryMeta(r.name), slug: label.slug, name: label.name, providerCountryId: r.countryId },
        costUsdCents: usdToCents(r.cost),
        stock: stockFromCount(r.count),
        stockCount: r.count,
      };
    });
  }

  /**
   * The whole catalog in three requests, not one per service.
   *
   * getPrices with neither a service nor a country filter returns every
   * priced pair GrizzlySMS currently sells, keyed country -> service, which
   * is exactly the shape the catalog sync needs. Together with the service
   * and country name lists (both cached, and usually already warm) that is
   * the entire catalog for three HTTP calls, against several hundred for
   * the equivalent per-service walk.
   *
   * Everything here comes from the supplier: no service list is hardcoded,
   * and a pair the supplier stops offering simply stops appearing.
   */
  async getFullCatalog(): Promise<ProviderCatalogEntry[]> {
    const [prices, services, { idToName }] = await Promise.all([
      this.fetchPrices({}),
      this.loadServices(),
      this.loadCountries(),
    ]);

    // The price payload is keyed by the supplier's own service code, so a
    // code -> display name lookup is what turns it into our own slugs.
    const nameByCode = new Map(services.map((service) => [service.code, service.name]));

    // Grouped by service first: a collision between two country ids sharing
    // one name is only meaningful among the entries actually priced for the
    // SAME service (a service only one of the two ids currently has stock
    // for was never ambiguous to begin with) — see assignVariantLabels()'s
    // own comment in country-meta.ts.
    const byService = new Map<
      string,
      Array<{ countryId: string; name: string; cost: number; count: number }>
    >();
    for (const [countryId, byServiceEntry] of prices) {
      const countryName = idToName.get(countryId);
      // A price for a country the country list does not name cannot be
      // labelled, and an unlabelled country is not something to offer.
      if (!countryName) continue;

      for (const [code, entry] of byServiceEntry) {
        // Same reasoning for services: the price list occasionally carries
        // codes absent from the catalog list, and those are skipped rather
        // than shown under their raw code.
        if (!nameByCode.has(code)) continue;
        const list = byService.get(code);
        const row = { countryId, name: countryName, cost: entry.cost, count: entry.count };
        if (list) list.push(row);
        else byService.set(code, [row]);
      }
    }

    const entries: ProviderCatalogEntry[] = [];
    for (const [code, rows] of byService) {
      const serviceName = nameByCode.get(code)!;
      const labels = assignVariantLabels(rows.map((r) => ({ providerCountryId: r.countryId, name: r.name })));

      for (const row of rows) {
        const label = labels.get(row.countryId)!;
        if (label.name !== row.name) {
          console.error(
            `[grizzlysms] two distinct country ids both named "${row.name}" for "${code}" ` +
              `(id ${row.countryId}) — keeping both rather than letting one silently win on price, ` +
              `labelling this one "${label.name}".`,
          );
        }

        entries.push({
          service: {
            slug: slugify(serviceName),
            name: serviceName,
            color: "#63756F",
            category: "All services",
            providerServiceId: code,
          },
          country: {
            ...resolveCountryMeta(row.name),
            slug: label.slug,
            name: label.name,
            providerCountryId: row.countryId,
          },
          costUsdCents: usdToCents(row.cost),
          stock: stockFromCount(row.count),
          stockCount: row.count,
        });
      }
    }

    return entries;
  }

  async getAvailability(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<ProviderAvailability | null> {
    const code = await this.resolveServiceCode(serviceSlug);
    if (!code) return null;
    // resolveCountryId() itself is now the fresh, uncached lookup this
    // figure is validated against (see its own comment): no second
    // fetchPrices() call here, since that would only re-ask GrizzlySMS the
    // exact same live question resolveCountryId() already just answered.
    const resolved = await this.resolveCountryId(code, countrySlug);
    if (!resolved) return null;
    const { id: countryId, label, entry } = resolved;

    const name = GrizzlySmsProvider.countryNamesCache?.get(countryId);
    if (!name) return null;

    return {
      serviceSlug,
      // slug/name come from the resolved label, not resolveCountryMeta(name)
      // alone: for a synthesized "(2)"-style variant, the raw name here is
      // the same plain name its sibling carries ("USA"), and only the label
      // actually distinguishes them — carrying it through is what keeps a
      // purchase, the deliverability lookup, and what the customer sees all
      // referring to the exact same variant they picked.
      country: { ...resolveCountryMeta(name), slug: label.slug, name: label.name, providerCountryId: countryId },
      costUsdCents: usdToCents(entry.cost),
      stock: stockFromCount(entry.count),
      stockCount: entry.count,
    };
  }

  async purchaseNumber(
    serviceSlug: string,
    countrySlug: string,
    maxCostUsdCents?: number,
    providerOfferId?: string,
  ): Promise<PurchasedNumber> {
    const code = await this.resolveServiceCode(serviceSlug);
    const resolved = code ? await this.resolveCountryId(code, countrySlug) : null;
    if (!code || !resolved) {
      throw new ProviderError("Unknown service or country.", "rejected");
    }
    const countryId = resolved.id;

    const params: Record<string, string> = {
      action: "getNumberV2",
      service: code,
      country: countryId,
    };
    // The additional provider-side safety rail: if the live price has
    // risen past what Xencodes already quoted the customer, GrizzlySMS
    // itself refuses the request rather than this purchase silently
    // costing more than the order it is about to be attached to.
    if (maxCostUsdCents !== undefined) {
      const maxUsd = maxCostUsdCents / 100;
      params.maxPrice = maxUsd.toFixed(4);
    }
    // Targets one exact seller/pool (see ProviderPool) rather than
    // GrizzlySMS's own default assignment — set only when
    // src/lib/provider-pool-quality.ts found real evidence this one pool
    // delivers materially better than the alternatives. A documented
    // getNumberV2 parameter (confirmed from GrizzlySMS's own published
    // client library), passed through verbatim.
    if (providerOfferId !== undefined) {
      params.providerIds = providerOfferId;
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

  /**
   * Diagnostic only — see NumberProvider.debugPriceTiers's own comment.
   * GrizzlySMS's client libraries reference getPricesV2 and getPricesV3
   * actions this adapter has never called (it has only ever used plain
   * getPrices, confirmed against this account's own live responses); their
   * real shape against a real account is not confirmed anywhere, and
   * GrizzlySMS's own public statements say full price-tier access through
   * the API is a planned, not yet shipped, feature — both reasons this asks
   * the live account directly and returns/logs exactly what comes back,
   * rather than this adapter guessing a shape to parse. Read-only: every
   * action tried here only reads prices, the same as the sync already does
   * continuously; nothing here reserves a number or spends anything. Each
   * action is tried independently so one being unsupported or erroring
   * never hides what the others returned.
   */
  async debugPriceTiers(serviceSlug: string, countrySlug: string): Promise<string> {
    const code = await this.resolveServiceCode(serviceSlug);
    if (!code) return `Could not resolve service "${serviceSlug}" to a GrizzlySMS service code.`;

    if (!isFresh(GrizzlySmsProvider.countriesCache, CATALOG_TTL_MS)) await this.loadCountries();
    let countryId: string | null = null;
    for (const [id, name] of GrizzlySmsProvider.countryNamesCache ?? []) {
      if (resolveCountryMeta(name).slug === countrySlug) {
        countryId = id;
        break;
      }
    }
    if (!countryId) return `Could not resolve country "${countrySlug}" to a GrizzlySMS country id.`;

    const lines: string[] = [`service="${serviceSlug}" (code ${code}), country="${countrySlug}" (id ${countryId})`];
    for (const action of ["getPrices", "getPricesV2", "getPricesV3"]) {
      try {
        const text = await this.call({ action, service: code, country: countryId });
        console.error(`[grizzlysms] diagnostic ${action} raw response (${text.length} bytes): ${text.slice(0, 4000)}`);
        lines.push(`${action}: ${text.slice(0, 1500)}${text.length > 1500 ? " …(truncated, full text in logs)" : ""}`);
      } catch (error) {
        lines.push(`${action}: FAILED — ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    return lines.join("\n\n");
  }

  /**
   * The real per-seller breakdown behind one exact service+country — see
   * ProviderPool's own comment in types.ts. Confirmed, from a live response
   * on a real account, that getPricesV3 returns a "providers" object keyed
   * by GrizzlySMS's own seller id for a pair with more than one (WhatsApp/
   * USA: 11 distinct ids, prices from $1 to $5 — the same price points a
   * customer reported seeing on GrizzlySMS's own site), and omits
   * "providers" entirely for a pair with nothing to distinguish (Fiverr/
   * USA, same account). Returns null for either shape of "nothing to
   * choose between" — GrizzlySMS has no breakdown for this pair, or this
   * exact pair/service could not be resolved — never an empty array passed
   * off as a confirmed "only one pool" answer.
   */
  async getProviderPools(serviceSlug: string, countrySlug: string): Promise<ProviderPool[] | null> {
    const code = await this.resolveServiceCode(serviceSlug);
    if (!code) return null;
    const resolved = await this.resolveCountryId(code, countrySlug);
    if (!resolved) return null;

    let text: string;
    try {
      text = await this.call({ action: "getPricesV3", service: code, country: resolved.id });
    } catch (error) {
      console.error(`[grizzlysms] getPricesV3 failed for "${serviceSlug}"/"${countrySlug}":`, error);
      return null;
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`[grizzlysms] getPricesV3 returned non-JSON for "${serviceSlug}"/"${countrySlug}": ${text.slice(0, 500)}`);
      return null;
    }

    return parseProviderPools(data, resolved.id, code);
  }

  /**
   * Lets a network/HTTP failure from call() propagate as the ProviderError
   * it already is, matching every other method in this adapter — an
   * earlier version swallowed it into a plain `null` return, which made a
   * failed request indistinguishable from "the response had no balance
   * field", the one thing balance-monitoring code must never confuse (see
   * src/lib/provider-balance-monitor.ts: a failed check must never be
   * treated as a $0.00 balance and must never fire a low-balance alert).
   */
  async getProviderBalanceUsdCents(): Promise<number | null> {
    const text = await this.call({ action: "getBalance" });
    const parts = parseColonResponse(text, "ACCESS_BALANCE");
    if (!parts || parts.length === 0) return null;
    const usd = Number(parts[0]);
    return Number.isFinite(usd) ? usdToCents(usd) : null;
  }

  /**
   * A real request to GrizzlySMS with no side effect: getBalance only reads
   * the account's own balance, never reserves a number or spends anything.
   * Used solely by the admin's "Test connection", to answer "does this key
   * actually work" without touching inventory.
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const text = await this.call({ action: "getBalance" });
      const parts = parseColonResponse(text, "ACCESS_BALANCE");
      if (parts && parts.length > 0) {
        const usd = Number(parts[0]);
        return {
          ok: true,
          message: Number.isFinite(usd)
            ? `Connected. Account balance: $${usd.toFixed(2)}.`
            : "Connected.",
        };
      }
      const trimmed = text.trim();
      return {
        ok: false,
        message: ERROR_MESSAGES[trimmed] ?? `Unexpected response: ${trimmed.slice(0, 200)}`,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof ProviderError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Connection test failed.",
      };
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
        result.set(slugify(service.name), usdToCents(usd));
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

/**
 * getPrices' response has been observed, in production logs from this
 * project, to fail this parser's original assumption on every single
 * service-scoped call, which a one-off fluke would not do. The most likely
 * explanation, common in this API family: filtering to one service
 * collapses the response by a level, since there is no longer a reason to
 * key by service code when only one was ever going to appear. That case is
 * handled below as `requestedServiceCode`. This is a considered fix, not a
 * blind guess repeated a third time: parseFullCatalogEntries()'s caller
 * additionally logs a raw response preview on any remaining parse failure
 * (see fetchPrices()), so a shape neither branch here anticipates is
 * captured for a precise fix rather than silently failing again.
 */
function parsePricesResponse(
  data: unknown,
  requestedServiceCode?: string,
): Map<string, Map<string, { cost: number; count: number }>> | null {
  if (typeof data !== "object" || data === null) return null;

  const result = new Map<string, Map<string, { cost: number; count: number }>>();

  for (const [countryId, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;

    // Collapsed shape: countryId -> {cost, count} directly, the requested
    // service implied rather than named. Detected by the presence of a
    // numeric cost field one level higher than the nested shape expects.
    const directCost = Number(record.cost ?? record.price);
    if (requestedServiceCode && Number.isFinite(directCost) && directCost > 0) {
      const count = Number(record.count ?? record.quant ?? 0);
      const inner = new Map<string, { cost: number; count: number }>();
      inner.set(requestedServiceCode, { cost: directCost, count: Number.isFinite(count) ? count : 0 });
      result.set(countryId, inner);
      continue;
    }

    // Standard shape: countryId -> serviceCode -> {cost, count}.
    const inner = new Map<string, { cost: number; count: number }>();
    for (const [serviceCode, entry] of Object.entries(record)) {
      if (typeof entry !== "object" || entry === null) continue;
      const entryRecord = entry as Record<string, unknown>;
      const cost = Number(entryRecord.cost ?? entryRecord.price);
      const count = Number(entryRecord.count ?? entryRecord.quant ?? 0);
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

/**
 * getPricesV3's confirmed shape: countryId -> serviceCode -> { price, count,
 * providers? }, where "providers" (when present) is itself keyed by
 * GrizzlySMS's own seller id, each an object carrying its own count and a
 * price — observed, on a real account, as a one-element array (e.g.
 * `[1.35]`), defended here against a bare number too since nothing
 * published confirms that shape is permanent. Returns null for anything
 * that does not match — no "providers" key, an empty one, or an
 * unrecognised shape — never a guessed or partial pool list.
 */
function parseProviderPools(
  data: unknown,
  countryId: string,
  serviceCode: string,
): ProviderPool[] | null {
  if (typeof data !== "object" || data === null) return null;
  const byCountry = (data as Record<string, unknown>)[countryId];
  if (typeof byCountry !== "object" || byCountry === null) return null;
  const byService = (byCountry as Record<string, unknown>)[serviceCode];
  if (typeof byService !== "object" || byService === null) return null;
  const providers = (byService as Record<string, unknown>).providers;
  if (typeof providers !== "object" || providers === null) return null;

  const pools: ProviderPool[] = [];
  for (const [poolId, value] of Object.entries(providers as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const record = value as Record<string, unknown>;
    const priceField = record.price;
    const price = Array.isArray(priceField) ? Number(priceField[0]) : Number(priceField);
    const count = Number(record.count);
    if (!Number.isFinite(price) || price <= 0) continue;
    pools.push({
      providerOfferId: poolId,
      costUsdCents: usdToCents(price),
      stockCount: Number.isFinite(count) && count > 0 ? count : 0,
    });
  }

  return pools.length > 0 ? pools : null;
}
