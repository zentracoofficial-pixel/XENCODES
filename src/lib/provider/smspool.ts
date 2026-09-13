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
 * This environment's network policy blocks smspool.net and api.smspool.net
 * outright, so this was originally built from SMSPool's published docs and
 * client libraries rather than a live response, with two things marked as
 * inference. Both have since been confirmed live (see git history) and
 * corrected here:
 *
 * 1. /country/retrieve_all does return an ISO2 code (`short_name`) and dial
 *    code (`cc`) directly, so flag and dial code are read straight off the
 *    response instead of a name-keyed guess table.
 * 2. /service/retrieve_all?country=<id> does NOT carry a price per service,
 *    confirmed against a real response: every row is just {ID, name}. The
 *    only way to price a (service, country) pair is one /request/price call
 *    each. SMSPool lists well over a thousand services across 144+
 *    countries, so pricing all of them would mean 250,000+ live calls on
 *    every cache refresh, which is not viable. This deliberately only
 *    prices KNOWN_SERVICE_NAMES below: real, confirmed SMSPool service
 *    names for the platforms customers actually search for, not an attempt
 *    at full coverage of SMSPool's catalog.
 */

const BASE_URL = "https://api.smspool.net";
const REQUEST_TIMEOUT_MS = 15_000;

export interface SmsPoolConfig {
  apiKey: string;
  /** Naira per one US dollar. SMSPool prices everything in USD. */
  usdToNgnRate: number;
}

// ---------------------------------------------------------------------------
// SMSPool's /country/retrieve_all confirmed live (see git history) to
// already return short_name (ISO2) and cc (dial code digits, no "+"), so
// flag and dial code are derived straight from the response for every
// country, not just a curated subset. The one thing it does not return is
// how many digits a national number has, so that stays a best-effort table
// keyed by ISO2, covering common markets; anything missing just shows no
// formatted digit count rather than failing.
// ---------------------------------------------------------------------------

const NATIONAL_DIGITS: Record<string, number> = {
  NG: 10, US: 10, GB: 10, CA: 10, DE: 11, ID: 11, PL: 9, PH: 10, FR: 9,
  ES: 9, IT: 10, NL: 9, BE: 9, PT: 9, SE: 9, NO: 8, DK: 8, FI: 9, IE: 9,
  AT: 10, CH: 9, CZ: 9, RO: 9, GR: 10, HU: 9, UA: 9, RU: 10, TR: 10,
  IN: 10, PK: 10, BD: 10, VN: 9, TH: 9, MY: 9, SG: 8, CN: 11, JP: 10,
  KR: 10, AU: 9, NZ: 9, BR: 11, MX: 10, AR: 10, CO: 10, CL: 9, PE: 9,
  ZA: 9, KE: 9, GH: 9, EG: 10, MA: 9, SA: 9, AE: 9, IL: 9,
};

/** Only a real two-letter ISO code makes a sensible flag; SMSPool also uses
 *  suffixed pseudo-codes like "US_V" for virtual number pools, which fall
 *  back to a plain flag instead of encoding garbage. */
function flagFromIso2(iso2: string) {
  if (!/^[A-Z]{2}$/.test(iso2)) return "🏳️";
  return String.fromCodePoint(
    ...iso2.split("").map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65)),
  );
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// SMSPool often lists a service under a longer or combined name than the
// short one curated in data/services.ts (confirmed live, see git history:
// its real "Instagram / Threads" vs our curated "Instagram", "Twitter / X"
// vs "X (Twitter)", and so on). Without this, those still get priced (they
// are in KNOWN_SERVICE_NAMES below by their real name) but would silently
// miss the brand colour already designed for them and show a plain grey
// icon instead.
const REAL_NAME_TO_CURATED: Record<string, string> = {
  "instagram / threads": "instagram",
  "facebook / meta viewpoints": "facebook",
  "tiktok/douyin": "tiktok",
  "twitter / x": "x (twitter)",
  "amazon / amazon web services": "amazon",
  "google/gmail": "google",
  "uber / postmates": "uber",
  "openai / chatgpt": "openai",
};

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

const FALLBACK_CATEGORY = "Other";

// A service with no curated brand colour used to fall back to one flat
// grey (literally --muted-foreground, the same tone as ordinary body text),
// so a directory of a thousand-plus uncurated names looked washed out and
// broken rather than intentional. Sourcing a real logo for each one is not
// realistic by hand, so instead each name deterministically picks one of
// these, muted and professional enough to sit next to the curated brand
// colours without clashing, but varied enough that the grid reads as
// designed rather than uniformly grey.
const FALLBACK_PALETTE = [
  "#0F4C5C", // deep teal
  "#5B3A29", // umber
  "#6B2D5C", // plum
  "#8A3B12", // rust
  "#1F4E79", // slate blue
  "#3D348B", // indigo
  "#2E5339", // moss green
  "#7B2D26", // brick
  "#5C4A72", // muted violet
  "#1B4332", // pine
  "#6B4226", // walnut
  "#33475B", // steel
];

function fallbackColorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

// Well-known consumer brands with a real logo added to brandIcons.ts
// (confirmed live from simple-icons, see git history), for names outside
// the original curated 40 in data/services.ts. slugify(row.name) already
// produces the exact key each logo is stored under for every one of these,
// so only their colour and category need overriding here instead of
// falling through to fallbackColorFor()/FALLBACK_CATEGORY.
const EXTRA_BRANDED: Record<string, { color: string; category: string }> = {
  "target": { color: "#CC0000", category: FALLBACK_CATEGORY },
  "starbucks": { color: "#00704A", category: FALLBACK_CATEGORY },
  "nike": { color: "#111111", category: FALLBACK_CATEGORY },
  "doordash": { color: "#FF3008", category: "Travel & Delivery" },
  "lyft": { color: "#FF00BF", category: "Travel & Delivery" },
  "pinterest": { color: "#E60023", category: "Social & Messaging" },
  "gitlab": { color: "#FC6D26", category: "Developer & Cloud" },
  "roblox": { color: "#000000", category: "Entertainment" },
  "adidas": { color: "#000000", category: FALLBACK_CATEGORY },
  "vk": { color: "#0077FF", category: "Social & Messaging" },
  "baidu": { color: "#2932E1", category: "Social & Messaging" },
  "line": { color: "#00C300", category: "Social & Messaging" },
  "cocacola": { color: "#D00013", category: FALLBACK_CATEGORY },
  "epic games": { color: "#313131", category: "Entertainment" },
  "alibaba": { color: "#FF6A00", category: "Marketplaces & Freelance" },
  "kakaotalk": { color: "#FFCD00", category: "Social & Messaging" },
};

// Real SMSPool service names, confirmed present in a live response (see git
// history), worth pricing even without a curated brand colour of their own
// (they get fallbackColorFor()/FALLBACK_CATEGORY via toProviderService,
// same as any other uncurated name). Deliberately a top slice of
// well-known consumer platforms, not an attempt at SMSPool's full
// ~1800-service catalog: see the file header for why pricing everything
// isn't viable.
const KNOWN_SERVICE_NAMES = new Set([
  "whatsapp", "telegram", "instagram / threads", "facebook / meta viewpoints",
  "twitter / x", "tiktok/douyin", "discord", "snapchat", "google/gmail",
  "google voice", "microsoft / microsoft rewards / outlook / bing", "apple",
  "amazon / amazon web services", "netflix", "spotify", "uber / postmates",
  "linkedin", "steam", "twitch", "openai / chatgpt", "tinder", "reddit",
  "yahoo", "ebay", "airbnb", "doordash", "grubhub", "lyft", "signal", "line",
  "line2", "viber", "wechat", "skype", "protonmail", "roblox", "epic games",
  "nvidia", "adobe", "grindr", "hinge", "booking.com", "tripadvisor",
  "shopify", "indeed", "upwork", "fiverr", "freelancer", "docusign",
  "ringcentral", "dialpad", "messagebird", "twilio / sendgrid", "pinterest",
  "badoo", "okcupid", "plenty of fish", "match / meetic / zweisam",
  "coffee meets bagel", "happn", "meetme", "clubhouse", "kik", "imo",
  "kakaotalk", "vk", "weibo", "baidu", "alibaba", "aliexpress", "taobao",
  "shopee", "lazada", "tokopedia", "grab", "gojek", "bolt", "careem",
  "olacabs", "didi", "walmart", "target", "bestbuy", "starbucks",
  "burger king", "dunkindonuts", "chick-fil-a", "cocacola", "nike",
  "adidas", "zara", "shein", "temu", "wish", "etsy", "poshmark", "depop",
  "mercari", "offerup", "craigslist", "olx", "carousell", "vinted",
  "truecaller", "yandex", "mailru", "instacart", "cvs", "walgreens",
  "chipotle", "pubgmobile", "garena", "firebase", "gitlab", "cursor",
  "perplexity", "claudeai / anthropic", "mistral ai", "yelp", "home depot",
  "lowes", "publix", "vrbo", "xbox",
]);

function isKnownService(name: string) {
  const key = name.trim().toLowerCase();
  return CURATED_BY_NAME.has(key) || KNOWN_SERVICE_NAMES.has(key);
}

// ---------------------------------------------------------------------------
// SMSPool's own response shapes, as documented.
// ---------------------------------------------------------------------------

interface RawCountry {
  ID: string | number;
  name: string;
  /** ISO2, confirmed live. Not always a real ISO code: SMSPool uses
   *  suffixed pseudo-codes like "US_V" for its virtual number pools. */
  short_name: string;
  /** Dial code digits, no leading "+", confirmed live. */
  cc: string;
  region?: string;
}

interface RawService {
  ID: string | number;
  name: string;
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
  /** On-demand pricing for one service at a time, cached per slug: how a
   *  service outside KNOWN_SERVICE_NAMES still becomes buyable. See
   *  listOffersForService(). unstable_cache folds the argument into its own
   *  cache key, so this stays one entry per distinct slug automatically. */
  private readonly cachedOffersForService: (
    serviceSlug: string,
  ) => Promise<ProviderOffer[]>;

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
    this.cachedOffersForService = unstable_cache(
      (serviceSlug: string) => this.fetchOffersForService(serviceSlug),
      ["smspool-offers-for-service", keyPart],
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

  async listOffersForService(serviceSlug: string): Promise<ProviderOffer[]> {
    return this.cachedOffersForService(serviceSlug);
  }

  private async fetchCountries(): Promise<ProviderCountry[]> {
    const rows = await this.call<RawCountry[]>("/country/retrieve_all", {});
    return rows.map((row) => {
      const iso2 = row.short_name?.trim().toUpperCase() ?? "";
      return {
        slug: `sp-${row.ID}`,
        name: row.name,
        flag: flagFromIso2(iso2),
        dialCode: row.cc ? `+${row.cc}` : "",
        nationalDigits: NATIONAL_DIGITS[iso2] ?? 10,
      };
    });
  }

  private async fetchServices(): Promise<ProviderService[]> {
    const rows = await this.cachedRawServices();
    return rows.map((row) => this.toProviderService(row));
  }

  private toProviderService(row: RawService): ProviderService {
    const key = row.name.trim().toLowerCase();
    const curated = CURATED_BY_NAME.get(REAL_NAME_TO_CURATED[key] ?? key);
    const extra = EXTRA_BRANDED[key];
    return {
      slug: curated?.slug ?? (slugify(row.name) || `sp-${row.ID}`),
      name: row.name,
      color: curated?.color ?? extra?.color ?? fallbackColorFor(row.name),
      category: curated?.category ?? extra?.category ?? FALLBACK_CATEGORY,
    };
  }

  /**
   * One offer per (service, country) pair SMSPool can currently fulfil.
   *
   * /service/retrieve_all?country=<id> confirmed live to carry no price
   * field at all (see file header) - it only says which services exist in
   * that country. Pricing a pair is always a separate /request/price call,
   * so this only prices KNOWN_SERVICE_NAMES, not everything the country
   * lists, to keep total call volume bounded.
   *
   * Two levels of concurrency, both bounded, since a plain sequential loop
   * at either level was slow enough to time out the very first production
   * build (see git history): countries themselves run 10 at a time, and
   * within a country, its known services are priced 8 at a time rather
   * than one after another.
   */
  private async fetchOffers(): Promise<ProviderOffer[]> {
    const countries = await this.cachedCountries();

    const perCountry = await mapWithConcurrency(countries, 10, async (country) => {
      const countryId = country.slug.replace(/^sp-/, "");

      let rows: RawService[];
      try {
        rows = await this.call<RawService[]>("/service/retrieve_all", {
          country: countryId,
        });
      } catch {
        // A country with nothing available for it should not break the
        // whole catalog resolution.
        return [] as ProviderOffer[];
      }

      const knownRows = rows.filter((row) => isKnownService(row.name));

      const priced = await mapWithConcurrency(knownRows, 8, async (row) => {
        const service = this.toProviderService(row);
        try {
          const result = await this.call<{ price?: string | number }>(
            "/request/price",
            { country: countryId, service: row.ID },
          );
          const priceUsd = firstNumber(result.price);
          return priceUsd !== undefined
            ? this.buildOffer(service.slug, country.slug, priceUsd)
            : null;
        } catch {
          // Genuinely unavailable for this pair right now.
          return null;
        }
      });

      return priced.filter((offer): offer is ProviderOffer => offer !== null);
    });

    return perCountry.flat();
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

  /**
   * Prices one specific service across every country, on demand. This is
   * how a service outside KNOWN_SERVICE_NAMES (fetchOffers()'s eagerly
   * priced set) still becomes buyable: a customer selecting it triggers
   * exactly this, not a change to what gets priced upfront for everyone.
   * Same per-pair /request/price call fetchOffers() uses, just scoped to
   * one already-known service id instead of every country's full listing.
   */
  private async fetchOffersForService(serviceSlug: string): Promise<ProviderOffer[]> {
    const serviceId = await this.resolveServiceId(serviceSlug);
    if (!serviceId) return [];

    const countries = await this.cachedCountries();

    const offers = await mapWithConcurrency(countries, 15, async (country) => {
      const countryId = country.slug.replace(/^sp-/, "");
      try {
        const result = await this.call<{ price?: string | number }>(
          "/request/price",
          { country: countryId, service: serviceId },
        );
        const priceUsd = firstNumber(result.price);
        return priceUsd !== undefined
          ? this.buildOffer(serviceSlug, country.slug, priceUsd)
          : null;
      } catch {
        // Genuinely unavailable for this pair right now.
        return null;
      }
    });

    return offers.filter((offer): offer is ProviderOffer => offer !== null);
  }
}

/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once.
 * Plain Promise.all would fire one request per country simultaneously
 * (100+ at once against SMSPool); a strict for-of loop, the previous
 * approach, fires them one at a time and was the actual cause of a build
 * timeout and slow page loads, since it means 100+ sequential round trips
 * on every cache miss. This keeps SMSPool responding at a reasonable
 * concurrency instead of either extreme.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const current = next++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function firstNumber(...values: (string | number | undefined)[]): number | undefined {
  for (const value of values) {
    if (value === undefined) continue;
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}
