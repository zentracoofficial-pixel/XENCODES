import { unstable_cache } from "next/cache";
import { services as curatedServices } from "@/data/services";
import type {
  NumberProvider,
  ProviderCountry,
  ProviderOffer,
  ProviderService,
  RequestedNumber,
  SmsStatus,
} from "./types";
import { ProviderError } from "./types";

// Must match CATALOG_TAG in src/lib/catalog.ts, duplicated as a literal to
// avoid a circular import (catalog.ts -> provider/index.ts -> this file).
// Sharing the tag means an admin's revalidateCatalog() call also clears the
// catalog data cached here, so a change still takes effect immediately even
// though this cache is much longer-lived than the catalog's own.
const CATALOG_TAG = "catalog";
const PROVIDER_CACHE_SECONDS = 300;

/** A short, non-secret fingerprint used only to key the cache by account. */
function fingerprint(apiKey: string) {
  return apiKey.length > 8 ? `${apiKey.slice(0, 4)}${apiKey.slice(-4)}` : "key";
}

/**
 * Adapter for SMSPool (https://www.smspool.net).
 *
 * Built from SMSPool's published API article, their Postman collection
 * listing, and their own unofficial JS/Python client libraries, since this
 * environment's network policy blocks smspool.net and api.smspool.net
 * outright, so the wire format could not be exercised against the live
 * service. Every endpoint, parameter and field name below is what those
 * sources document. Two things are marked explicitly as inference rather
 * than fact, because no source gave a confirmed answer:
 *
 * 1. Whether /service/retrieve_all?country=<id> returns a price per service
 *    for that country. Passing a country to a "list services" call only
 *    makes sense if it does, so this is used as the primary path, with a
 *    fallback to the documented single-pair /request/price endpoint for
 *    anything that comes back without a price.
 * 2. SMSPool's country list gives a name and region, not a flag or dial
 *    code, so those are looked up from the name against a table of common
 *    countries below. A country whose name is not recognised still works,
 *    it just shows a plain flag and no formatted dial code.
 *
 * First real purchase against the live API should be watched closely, and
 * this file is the one place to correct if SMSPool's actual response shapes
 * differ from what is coded here.
 */

const BASE_URL = "https://api.smspool.net";
const REQUEST_TIMEOUT_MS = 15_000;

export interface SmsPoolConfig {
  apiKey: string;
  /** Naira per one US dollar. SMSPool prices everything in USD. */
  usdToNgnRate: number;
}

// ---------------------------------------------------------------------------
// Country name to flag/dial code. Covers SMSPool's common markets; anything
// missing degrades gracefully rather than failing.
// ---------------------------------------------------------------------------

interface CountryInfo {
  iso2: string;
  dialCode: string;
  nationalDigits: number;
}

const COUNTRY_INFO: Record<string, CountryInfo> = {
  nigeria: { iso2: "NG", dialCode: "+234", nationalDigits: 10 },
  "united states": { iso2: "US", dialCode: "+1", nationalDigits: 10 },
  usa: { iso2: "US", dialCode: "+1", nationalDigits: 10 },
  "united kingdom": { iso2: "GB", dialCode: "+44", nationalDigits: 10 },
  uk: { iso2: "GB", dialCode: "+44", nationalDigits: 10 },
  canada: { iso2: "CA", dialCode: "+1", nationalDigits: 10 },
  germany: { iso2: "DE", dialCode: "+49", nationalDigits: 11 },
  indonesia: { iso2: "ID", dialCode: "+62", nationalDigits: 11 },
  poland: { iso2: "PL", dialCode: "+48", nationalDigits: 9 },
  philippines: { iso2: "PH", dialCode: "+63", nationalDigits: 10 },
  france: { iso2: "FR", dialCode: "+33", nationalDigits: 9 },
  spain: { iso2: "ES", dialCode: "+34", nationalDigits: 9 },
  italy: { iso2: "IT", dialCode: "+39", nationalDigits: 10 },
  netherlands: { iso2: "NL", dialCode: "+31", nationalDigits: 9 },
  belgium: { iso2: "BE", dialCode: "+32", nationalDigits: 9 },
  portugal: { iso2: "PT", dialCode: "+351", nationalDigits: 9 },
  sweden: { iso2: "SE", dialCode: "+46", nationalDigits: 9 },
  norway: { iso2: "NO", dialCode: "+47", nationalDigits: 8 },
  denmark: { iso2: "DK", dialCode: "+45", nationalDigits: 8 },
  finland: { iso2: "FI", dialCode: "+358", nationalDigits: 9 },
  ireland: { iso2: "IE", dialCode: "+353", nationalDigits: 9 },
  austria: { iso2: "AT", dialCode: "+43", nationalDigits: 10 },
  switzerland: { iso2: "CH", dialCode: "+41", nationalDigits: 9 },
  "czech republic": { iso2: "CZ", dialCode: "+420", nationalDigits: 9 },
  romania: { iso2: "RO", dialCode: "+40", nationalDigits: 9 },
  greece: { iso2: "GR", dialCode: "+30", nationalDigits: 10 },
  hungary: { iso2: "HU", dialCode: "+36", nationalDigits: 9 },
  ukraine: { iso2: "UA", dialCode: "+380", nationalDigits: 9 },
  russia: { iso2: "RU", dialCode: "+7", nationalDigits: 10 },
  turkey: { iso2: "TR", dialCode: "+90", nationalDigits: 10 },
  india: { iso2: "IN", dialCode: "+91", nationalDigits: 10 },
  pakistan: { iso2: "PK", dialCode: "+92", nationalDigits: 10 },
  bangladesh: { iso2: "BD", dialCode: "+880", nationalDigits: 10 },
  vietnam: { iso2: "VN", dialCode: "+84", nationalDigits: 9 },
  thailand: { iso2: "TH", dialCode: "+66", nationalDigits: 9 },
  malaysia: { iso2: "MY", dialCode: "+60", nationalDigits: 9 },
  singapore: { iso2: "SG", dialCode: "+65", nationalDigits: 8 },
  "china": { iso2: "CN", dialCode: "+86", nationalDigits: 11 },
  japan: { iso2: "JP", dialCode: "+81", nationalDigits: 10 },
  "south korea": { iso2: "KR", dialCode: "+82", nationalDigits: 10 },
  australia: { iso2: "AU", dialCode: "+61", nationalDigits: 9 },
  "new zealand": { iso2: "NZ", dialCode: "+64", nationalDigits: 9 },
  brazil: { iso2: "BR", dialCode: "+55", nationalDigits: 11 },
  mexico: { iso2: "MX", dialCode: "+52", nationalDigits: 10 },
  argentina: { iso2: "AR", dialCode: "+54", nationalDigits: 10 },
  colombia: { iso2: "CO", dialCode: "+57", nationalDigits: 10 },
  chile: { iso2: "CL", dialCode: "+56", nationalDigits: 9 },
  peru: { iso2: "PE", dialCode: "+51", nationalDigits: 9 },
  "south africa": { iso2: "ZA", dialCode: "+27", nationalDigits: 9 },
  kenya: { iso2: "KE", dialCode: "+254", nationalDigits: 9 },
  ghana: { iso2: "GH", dialCode: "+233", nationalDigits: 9 },
  egypt: { iso2: "EG", dialCode: "+20", nationalDigits: 10 },
  morocco: { iso2: "MA", dialCode: "+212", nationalDigits: 9 },
  "saudi arabia": { iso2: "SA", dialCode: "+966", nationalDigits: 9 },
  "united arab emirates": { iso2: "AE", dialCode: "+971", nationalDigits: 9 },
  israel: { iso2: "IL", dialCode: "+972", nationalDigits: 9 },
};

function flagFromIso2(iso2: string) {
  return String.fromCodePoint(
    ...iso2
      .toUpperCase()
      .split("")
      .map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65)),
  );
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Reuse the brand colour and category already curated for every service this
// product was designed around, so a name SMSPool also uses (which is most of
// them, these are all common OTP marketplace listings) picks up its real
// logo colour and grouping instead of a generic fallback.
const CURATED_BY_NAME = new Map(
  curatedServices.map((service) => [
    service.name.toLowerCase(),
    { slug: service.slug, color: service.color, category: service.category },
  ]),
);

const FALLBACK_COLOR = "#63756F";
const FALLBACK_CATEGORY = "Other";

// ---------------------------------------------------------------------------
// SMSPool's own response shapes, as documented.
// ---------------------------------------------------------------------------

interface RawCountry {
  ID: string | number;
  name: string;
  region?: string;
}

interface RawService {
  ID: string | number;
  name: string;
  /** Only present, per SMSPool's own client libraries, when a country was
   *  passed to /service/retrieve_all. Field name is inferred; see the file
   *  header. */
  price?: string | number;
  rate?: string | number;
  cost?: string | number;
}

interface RawPurchaseResponse {
  success: 0 | 1;
  number?: string | number;
  phonenumber?: string;
  order_id?: string;
  expires_in?: number;
  cost?: string | number;
  type?: string;
  message?: string;
}

interface RawCheckResponse {
  status: number;
  sms?: string;
  full_sms?: string;
  message?: string;
}

const STATUS_RECEIVED = 3;
const STATUS_REFUNDED = 6;

export class SmsPoolProvider implements NumberProvider {
  readonly id = "smspool";
  readonly isLive = true;
  readonly label = "SMSPool";

  private readonly apiKey: string;
  private readonly usdToNgnRate: number;

  // Built once per instance and reused, so admin pages and catalog
  // resolution alike are not making dozens of live SMSPool requests on
  // every page view. Closes over this account's key and rate; the key
  // parts array carries only a fingerprint, never the raw secret.
  private readonly cachedCountries: () => Promise<ProviderCountry[]>;
  private readonly cachedServices: () => Promise<ProviderService[]>;
  private readonly cachedOffers: () => Promise<ProviderOffer[]>;
  /** The raw rows, ID included, shared by fetchServices and resolveServiceId
   *  so both read from one cached call rather than two. */
  private readonly cachedRawServices: () => Promise<RawService[]>;

  constructor(config: SmsPoolConfig) {
    this.apiKey = config.apiKey;
    this.usdToNgnRate = config.usdToNgnRate > 0 ? config.usdToNgnRate : 1;

    const keyPart = fingerprint(this.apiKey);
    const cacheOptions = { tags: [CATALOG_TAG], revalidate: PROVIDER_CACHE_SECONDS };
    this.cachedRawServices = unstable_cache(
      () => this.call<RawService[]>("/service/retrieve_all", {}),
      ["smspool-raw-services", keyPart],
      cacheOptions,
    );
    this.cachedCountries = unstable_cache(
      () => this.fetchCountries(),
      ["smspool-countries", keyPart],
      cacheOptions,
    );
    this.cachedServices = unstable_cache(
      () => this.fetchServices(),
      ["smspool-services", keyPart],
      cacheOptions,
    );
    this.cachedOffers = unstable_cache(
      () => this.fetchOffers(),
      ["smspool-offers", keyPart],
      cacheOptions,
    );
  }

  private usdToNaira(usd: number) {
    // Kept on 5 Naira steps, same as the markup rounding elsewhere, so a
    // provider price and an admin-marked-up price read consistently.
    return Math.max(5, Math.round((usd * this.usdToNgnRate) / 5) * 5);
  }

  private async call<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    const query = new URLSearchParams({ key: this.apiKey });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.set(k, String(v));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}?${query.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError("SMSPool did not respond in time.", "network");
      }
      throw new ProviderError("Could not reach SMSPool.", "network");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("SMSPool rejected the API key.", "rejected");
    }
    if (!response.ok) {
      throw new ProviderError(`SMSPool responded with ${response.status}.`, "unknown");
    }

    const data = (await response.json()) as T & {
      success?: 0 | 1;
      type?: string;
      message?: string;
    };

    // Endpoints that can fail report success: 0 with a type. Endpoints like
    // sms/check use a numeric status instead and never set success, so only
    // treat this as an error when success is explicitly 0.
    if (data.success === 0) {
      const type = data.type ?? "";
      const code =
        type === "OUT_OF_STOCK"
          ? "out_of_stock"
          : type === "BALANCE_ERROR" || type === "PRICE_NOT_FOUND"
            ? "rejected"
            : "unknown";
      throw new ProviderError(data.message ?? "SMSPool refused the request.", code);
    }

    return data;
  }

  async listCountries(): Promise<ProviderCountry[]> {
    return this.cachedCountries();
  }

  async listServices(): Promise<ProviderService[]> {
    return this.cachedServices();
  }

  async listOffers(): Promise<ProviderOffer[]> {
    return this.cachedOffers();
  }

  private async fetchCountries(): Promise<ProviderCountry[]> {
    const rows = await this.call<RawCountry[]>("/country/retrieve_all", {});
    return rows.map((row) => {
      const info = COUNTRY_INFO[row.name.trim().toLowerCase()];
      return {
        slug: `sp-${row.ID}`,
        name: row.name,
        flag: info ? flagFromIso2(info.iso2) : "🏳️",
        dialCode: info?.dialCode ?? "",
        nationalDigits: info?.nationalDigits ?? 10,
      };
    });
  }

  private async fetchServices(): Promise<ProviderService[]> {
    const rows = await this.cachedRawServices();
    return rows.map((row) => this.toProviderService(row));
  }

  private toProviderService(row: RawService): ProviderService {
    const curated = CURATED_BY_NAME.get(row.name.trim().toLowerCase());
    return {
      slug: curated?.slug ?? (slugify(row.name) || `sp-${row.ID}`),
      name: row.name,
      color: curated?.color ?? FALLBACK_COLOR,
      category: curated?.category ?? FALLBACK_CATEGORY,
    };
  }

  /**
   * One offer per (service, country) pair SMSPool can currently fulfil.
   *
   * Fetches a per-country service list, which SMSPool's own client shows
   * accepts a country filter, in the hope it carries a price for each
   * service in that country (see the file header). Any service that comes
   * back without a recognisable price field falls back to the documented
   * single-pair /request/price call, but only for services this catalog
   * already curates, so an incorrect guess costs at most one request per
   * known service per country rather than an unbounded cross product.
   */
  private async fetchOffers(): Promise<ProviderOffer[]> {
    const countries = await this.fetchCountries();
    const providerIdByCountrySlug = new Map(
      countries.map((c) => [c.slug, c.slug.replace(/^sp-/, "")]),
    );

    const offers: ProviderOffer[] = [];

    for (const country of countries) {
      const countryId = providerIdByCountrySlug.get(country.slug);
      if (!countryId) continue;

      let rows: RawService[];
      try {
        rows = await this.call<RawService[]>("/service/retrieve_all", {
          country: countryId,
        });
      } catch {
        // A country with nothing available for it should not break the
        // whole catalog resolution.
        continue;
      }

      for (const row of rows) {
        const priceUsd = firstNumber(row.price, row.rate, row.cost);
        const service = this.toProviderService(row);

        if (priceUsd !== undefined) {
          offers.push(this.buildOffer(service.slug, country.slug, priceUsd));
          continue;
        }

        // No price on the per-country listing: fall back to the confirmed
        // single-pair endpoint, but only for services this catalog already
        // curates, to keep the fallback bounded.
        if (!CURATED_BY_NAME.has(row.name.trim().toLowerCase())) continue;

        try {
          const priced = await this.call<{ price?: string | number }>(
            "/request/price",
            { country: countryId, service: row.ID },
          );
          const fallbackUsd = firstNumber(priced.price);
          if (fallbackUsd !== undefined) {
            offers.push(this.buildOffer(service.slug, country.slug, fallbackUsd));
          }
        } catch {
          // Genuinely unavailable for this pair right now.
        }
      }
    }

    return offers;
  }

  private buildOffer(
    serviceSlug: string,
    countrySlug: string,
    priceUsd: number,
  ): ProviderOffer {
    return {
      serviceSlug,
      countrySlug,
      priceNaira: this.usdToNaira(priceUsd),
      // SMSPool does not report a stock count on this listing, only that a
      // price is currently quoted, which implies availability.
      stock: "in_stock",
      avgDeliverySeconds: 25,
      successRate: 95,
    };
  }

  async requestNumber(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<RequestedNumber> {
    const countryId = countrySlug.replace(/^sp-/, "");
    const serviceId = await this.resolveServiceId(serviceSlug);
    if (!serviceId) {
      throw new ProviderError("That service is no longer offered.", "out_of_stock");
    }

    const data = await this.call<RawPurchaseResponse>("/purchase/sms", {
      country: countryId,
      service: serviceId,
    });

    if (!data.order_id || data.number === undefined) {
      throw new ProviderError(
        data.message ?? "SMSPool did not return a number.",
        "unknown",
      );
    }

    return {
      externalId: data.order_id,
      phoneNumber: `+${data.number}`,
      sessionSeconds: data.expires_in ?? 10 * 60,
    };
  }

  async checkSms(externalId: string): Promise<SmsStatus> {
    const data = await this.call<RawCheckResponse>("/sms/check", {
      orderid: externalId,
    });

    if (data.status === STATUS_RECEIVED && data.sms) {
      return { state: "received", code: data.sms, text: data.full_sms };
    }

    if (data.status === STATUS_REFUNDED) {
      // SMSPool has already refunded itself; Xencodes still needs to credit
      // the customer's own wallet, which the caller does for "expired".
      return { state: "expired" };
    }

    // Any other status (SMSPool has several for "pending", "resend
    // requested" and similar) is treated as still waiting. The activation's
    // own session timeout is the backstop that guarantees a refund even if
    // an unrecognised status is returned indefinitely.
    return { state: "waiting" };
  }

  async cancelNumber(externalId: string): Promise<void> {
    await this.call("/sms/cancel", { orderid: externalId });
  }

  /**
   * requestNumber only receives our slug, so resolve it back to SMSPool's
   * own id. Reads the cached service list rather than a fresh call, since
   * this runs on every purchase attempt.
   */
  private async resolveServiceId(slug: string): Promise<string | undefined> {
    const rows = await this.cachedRawServices();
    const match = rows.find((row) => this.toProviderService(row).slug === slug);
    return match ? String(match.ID) : undefined;
  }
}

function firstNumber(...values: (string | number | undefined)[]): number | undefined {
  for (const value of values) {
    if (value === undefined) continue;
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}
