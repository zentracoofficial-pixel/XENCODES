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
// 45 minutes: frequent enough that cost drift stays small and the admin
// markup (30% by default, see DEFAULT_GLOBAL_MARKUP_PERCENT in catalog.ts)
// comfortably absorbs whatever moves between refreshes, but still far below
// the refresh rate (every few minutes, at high concurrency) that originally
// tripped SMSPool's own rate limiting - see the 429 retry in call() and the
// bounded concurrency in fetchOffers(), both still doing their job here.
const PROVIDER_CACHE_SECONDS = 45 * 60;

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
 *    every cache refresh, which is not remotely viable - and even the
 *    curated subset (see isCuratedService()) is bounded to
 *    PRIORITY_COUNTRY_NAMES specifically because Vercel's Hobby plan
 *    hard-caps one function invocation at 10 seconds; see that constant's
 *    comment for the arithmetic. Every service outside the curated set,
 *    and every country outside the priority list, is still fully real,
 *    listed, and buyable - just priced live on demand (see
 *    listOffersForService()) instead of upfront on every catalog refresh.
 * 3. /request/price does return `success_rate` (confirmed live: WhatsApp in
 *    the US returned `{"price":"1.44","high_price":"1.96","success_rate":71}`)
 *    but no stock-count field of any kind. An earlier version of this
 *    guessed one under the name `pool`; that guess is now removed rather
 *    than kept as an unconfirmed field nobody checked.
 */

const BASE_URL = "https://api.smspool.net";
const REQUEST_TIMEOUT_MS = 15_000;
/** Retries for a 429 specifically, not any other failure: fetchOffers()
 *  runs many calls concurrently (see the file header on why pricing is
 *  bounded, not eliminated), and without this a burst of rate-limited
 *  responses is indistinguishable from every one of those pairs genuinely
 *  being unavailable, which silently drops real countries and services. */
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 400;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
// vs "X (Twitter)", and so on). isCuratedService() resolves through this
// map before checking CURATED_BY_NAME, so these are still recognised as
// curated and keep their designed brand colour instead of falling back to
// a generic one.
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
// history). Deliberately just the ~40 curated services, not an attempt at
// SMSPool's full ~1800-service catalog or even the broader "well-known
// brands" list this used to include (see git history: a ~124-name
// KNOWN_SERVICE_NAMES set). That larger list is what made the eager pass
// too slow to finish inside Vercel's hard function-duration ceiling (see
// PRIORITY_COUNTRY_NAMES below) - every service outside the curated set
// is still fully real, listed, and buyable, just priced on demand instead
// of upfront (see listOffersForService()).
//
// Resolves through REAL_NAME_TO_CURATED first because SMSPool often lists
// a curated service under a longer or combined real name (its real
// "Instagram / Threads" vs the curated "Instagram", and so on) - checking
// CURATED_BY_NAME alone would silently miss most of them.
function isCuratedService(name: string) {
  const key = name.trim().toLowerCase();
  return CURATED_BY_NAME.has(REAL_NAME_TO_CURATED[key] ?? key);
}

// SMSPool's real /country/retrieve_all list runs to 144 countries, and this
// project runs on Vercel's Hobby tier, which hard-caps a single serverless
// function at 10 seconds - a platform ceiling, not something maxDuration or
// any code-level timeout can raise. That number is what actually sizes this
// list, not a guess at "enough": eagerly pricing 40 curated services (see
// isCuratedService()) across N countries is roughly N x 40 live
// /request/price round trips, and at a concurrency gentle enough to not
// trip SMSPool's own rate limiting (see call()'s 429 retry), 10 countries
// comes out to a few seconds of real work - comfortably inside the 10s
// ceiling with margin for the rest of the request. The 32-country version
// this list used to be does not fit: the arithmetic (32 countries x up to
// ~124 services, the size of a now-removed broader "well-known" list) came
// to thousands of calls, which cannot finish in 10 seconds at any
// concurrency low enough to avoid rate limiting - so every cold cache hit
// timed out and silently served the bundled sample catalog instead, with
// nothing in the UI to say so beyond the small "Development data" notice.
// Names are exactly as confirmed live from a real /country/retrieve_all
// response (see file header): plain "Canada" and plain "Australia" do not
// exist in SMSPool's catalog, only "Australia (Virtual)" does.
const PRIORITY_COUNTRY_NAMES = new Set(
  [
    "Nigeria", "United States", "United Kingdom", "Germany", "France",
    "India", "Indonesia", "Brazil", "Philippines", "South Africa",
  ].map((name) => name.toLowerCase()),
);

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

/**
 * /request/price. `price` and `success_rate` confirmed live against a real
 * response: `{"price":"1.44","high_price":"1.96","success_rate":71}`. No
 * stock-count field appears in that response at all - an earlier version
 * of this guessed one under the name `pool`, which was never actually
 * confirmed and is removed rather than left as a silent guess.
 * `high_price` is real but currently unused; nothing here invents a field
 * that has not been seen on the wire.
 */
interface RawPrice {
  price?: string | number;
  high_price?: string | number;
  /** Share of recent activations on this pair that received a code. */
  success_rate?: string | number;
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
   *  service outside the curated eager set still becomes buyable. See
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

  /**
   * SMSPool's USD cost as exact kobo, rounded up to the next whole kobo.
   *
   * Deliberately not rounded to a tidy figure. A previous version rounded
   * this to the nearest 5 Naira, which rounds *down* about half the time:
   * a pair costing the equivalent of 1202 Naira was recorded as costing
   * 1200, and every downstream margin check then worked from a cost lower
   * than the provider actually bills. Rounding belongs on the customer
   * price (see src/lib/pricing.ts), and only ever upward.
   */
  private usdToKobo(usd: number) {
    return Math.ceil(usd * this.usdToNgnRate * 100);
  }

  private async call<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    const query = new URLSearchParams({ key: this.apiKey });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.set(k, String(v));
    }

    let response: Response | undefined;
    for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

      // A burst of concurrent requests (fetchOffers() prices many pairs at
      // once, see the file header) can trip SMSPool's own rate limiting.
      // Without backing off here, that would be indistinguishable from
      // every one of those pairs genuinely being unavailable, silently
      // dropping real countries and services rather than actually pricing
      // them. Retry with jittered exponential backoff before giving up.
      if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
        const delay = RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt * (0.75 + Math.random() * 0.5);
        await sleep(delay);
        continue;
      }
      break;
    }

    // The loop above only exits without a response if every attempt threw,
    // which already throws before reaching here; this satisfies the type
    // checker that response is defined.
    if (!response) {
      throw new ProviderError("Could not reach SMSPool.", "network");
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

  /**
   * Bypasses every price cache on this class on purpose. The two cached
   * reads it does use (resolveServiceId, cachedCountries) are id lookups,
   * not prices, and are safe to reuse; the /request/price call itself is
   * always fresh. This is what a purchase is checked against just before
   * charging, so a price that moved during the cache window cannot be
   * sold at the stale figure.
   */
  async getLiveCostKobo(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<number | null> {
    const serviceId = await this.resolveServiceId(serviceSlug);
    if (!serviceId) return null;

    const result = await this.call<RawPrice>("/request/price", {
      country: countrySlug.replace(/^sp-/, ""),
      service: serviceId,
    });

    const priceUsd = firstNumber(result.price);
    return priceUsd !== undefined ? this.usdToKobo(priceUsd) : null;
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
   * One offer per (service, country) pair SMSPool can currently fulfil, for
   * PRIORITY_COUNTRY_NAMES x the ~40 curated services only - see that
   * constant's own comment for the arithmetic on why this stays small: it
   * exists to make the homepage and instant search feel instant, not to
   * carry the catalog's real breadth (that is listOffersForService()'s
   * job, run per service on demand, unbounded by country).
   *
   * /service/retrieve_all?country=<id> confirmed live to carry no price
   * field at all (see file header) - it only says which services exist in
   * that country. Pricing a pair is always a separate /request/price call.
   *
   * Concurrency here is a second, independent constraint from total
   * volume: a plain sequential loop was slow enough to time out the very
   * first production build, but going too far the other way (10 countries
   * x 8 services, up to 80 requests in flight) tripped SMSPool's own rate
   * limiting hard enough that most pairs came back empty rather than
   * priced - indistinguishable from genuine unavailability without the 429
   * retry in call(). The numbers below are deliberately gentle on that
   * axis independently of how small the total volume already is.
   */
  private async fetchOffers(): Promise<ProviderOffer[]> {
    const allCountries = await this.cachedCountries();
    const countries = allCountries.filter((country) =>
      PRIORITY_COUNTRY_NAMES.has(country.name.trim().toLowerCase()),
    );

    const perCountry = await mapWithConcurrency(countries, 4, async (country) => {
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

      const knownRows = rows.filter((row) => isCuratedService(row.name));

      const priced = await mapWithConcurrency(knownRows, 5, async (row) => {
        const service = this.toProviderService(row);
        try {
          const result = await this.call<RawPrice>("/request/price", {
            country: countryId,
            service: row.ID,
          });
          return this.buildOffer(service.slug, country.slug, result);
        } catch {
          // Genuinely unavailable for this pair right now.
          return null;
        }
      });

      return priced.filter((offer): offer is ProviderOffer => offer !== null);
    });

    return perCountry.flat();
  }

  /**
   * Turns one /request/price response into an offer, or null when SMSPool
   * quotes no price for the pair (which is how it says "not available").
   *
   * Everything here comes off the response. Nothing is filled in from a
   * plausible constant: an earlier version of this hardcoded a 25 second
   * delivery time and a 95% success rate on every single offer, which the
   * buy page then displayed per country as though it had been measured
   * there. Both fields are optional on ProviderOffer precisely so an
   * adapter can decline to answer, and the UI hides what it is not told.
   */
  private buildOffer(
    serviceSlug: string,
    countrySlug: string,
    raw: RawPrice,
  ): ProviderOffer | null {
    const priceUsd = firstNumber(raw.price);
    if (priceUsd === undefined) return null;

    return {
      serviceSlug,
      countrySlug,
      costKobo: this.usdToKobo(priceUsd),
      // A quoted price is SMSPool's own signal that the pair is available.
      // No stock-count field exists on this response (confirmed live, see
      // RawPrice), so stockCount is simply never set here.
      stock: "in_stock",
      successRate: percent(raw.success_rate),
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
      // SMSPool has refunded its side. Reported as its own state, not
      // folded into "expired", so the order can be recorded as refunded
      // rather than as a timeout that happened to cost nothing.
      return { state: "refunded" };
    }

    // Only two numeric codes are confirmed against real responses: 3 for a
    // delivered code and 6 for a refund. SMSPool documents more states
    // (pending, activating, processing, cancelled, expired) but not which
    // integer each maps to, and guessing one here would silently settle a
    // live activation on the wrong signal. So everything else is reported
    // as still waiting, and the activation's own session timeout settles
    // and refunds it. That is a local, certain fact about elapsed time
    // rather than a guess at someone else's enum.
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
   * Prices one specific service across every country SMSPool has, on
   * demand. This is what the buy page runs on, so it is deliberately not
   * bounded to PRIORITY_COUNTRY_NAMES the way fetchOffers() is: a customer
   * looking at one service should see every country that service is really
   * available in, not the subset the eager pass had time to precompute.
   *
   * Affordable precisely because it is one service: the whole sweep is one
   * /request/price per country (~144 calls), against the eager pass's
   * countries x services. That headroom is why concurrency is higher here
   * than in fetchOffers(), while still far below the level that trips
   * SMSPool's rate limiting - and the 429 retry in call() covers the rest,
   * so a throttled response is retried rather than being mistaken for the
   * country being unavailable.
   */
  private async fetchOffersForService(serviceSlug: string): Promise<ProviderOffer[]> {
    const serviceId = await this.resolveServiceId(serviceSlug);
    if (!serviceId) return [];

    const countries = await this.cachedCountries();

    const offers = await mapWithConcurrency(countries, 10, async (country) => {
      const countryId = country.slug.replace(/^sp-/, "");
      try {
        const result = await this.call<RawPrice>("/request/price", {
          country: countryId,
          service: serviceId,
        });
        return this.buildOffer(serviceSlug, country.slug, result);
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

/** A percentage the provider actually sent, or undefined. Anything outside
 *  0 to 100 is treated as a field that does not mean what we assumed rather
 *  than clamped into looking valid. */
function percent(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n);
}

function firstNumber(...values: (string | number | undefined)[]): number | undefined {
  for (const value of values) {
    if (value === undefined) continue;
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}
