import { services as catalogServices } from "@/data/services";
import { countries as catalogCountries } from "@/data/countries";
import type {
  NumberProvider,
  ProviderCountry,
  ProviderOffer,
  ProviderService,
  RequestedNumber,
  SmsStatus,
  StockLevel,
} from "./types";
import { ProviderError } from "./types";

/**
 * DEVELOPMENT PROVIDER. Not real inventory.
 *
 * Used only while no live provider is configured, so the whole product can be
 * built and reviewed end to end. It serves the placeholder catalog under
 * src/data and simulates a code arriving a few seconds after purchase.
 *
 * Everything it returns is marked `isLive: false`, and the UI surfaces that
 * as a visible notice, so development data can never be mistaken for real
 * numbers. Configure a provider in the admin panel to replace it.
 */

const SESSION_SECONDS = 10 * 60;
const MIN_DELIVERY_SECONDS = 6;
const MAX_DELIVERY_SECONDS = 40;

const NATIONAL_DIGITS: Record<string, number> = {
  nigeria: 10,
  usa: 10,
  uk: 10,
  canada: 10,
  germany: 11,
  indonesia: 11,
  poland: 9,
  philippines: 10,
};

function stockFor(status: "available" | "limited" | "unavailable"): StockLevel {
  if (status === "available") return "in_stock";
  if (status === "limited") return "low";
  return "out_of_stock";
}

function randomDigits(count: number) {
  let out = "";
  for (let i = 0; i < count; i++) out += Math.floor(Math.random() * 10);
  return out;
}

/**
 * The external id carries its own outcome, so no server side state is needed
 * between the purchase request and the polls that follow it. Real adapters
 * store nothing here either: they hand back the provider's id.
 */
function encodeId(deliverAtMs: number, expiresAtMs: number, code: string) {
  return `dev:${deliverAtMs}:${expiresAtMs}:${code}`;
}

function decodeId(externalId: string) {
  const [prefix, deliverAt, expiresAt, code] = externalId.split(":");
  if (prefix !== "dev" || !deliverAt || !expiresAt || !code) return null;
  return { deliverAt: Number(deliverAt), expiresAt: Number(expiresAt), code };
}

export const developmentProvider: NumberProvider = {
  id: "development",
  label: "Development data",
  isLive: false,

  async listServices(): Promise<ProviderService[]> {
    return catalogServices.map((service) => ({
      slug: service.slug,
      name: service.name,
      color: service.color,
      category: service.category,
    }));
  },

  async listCountries(): Promise<ProviderCountry[]> {
    return catalogCountries.map((country) => ({
      slug: country.slug,
      name: country.name,
      flag: country.flag,
      dialCode: country.dialCode,
      nationalDigits: NATIONAL_DIGITS[country.slug] ?? 10,
    }));
  },

  async listOffers(): Promise<ProviderOffer[]> {
    return catalogServices.flatMap((service) =>
      service.availability
        .filter((entry) => entry.status !== "unavailable")
        .map((entry) => ({
          serviceSlug: service.slug,
          countrySlug: entry.countrySlug,
          priceNaira: entry.priceNaira,
          stock: stockFor(entry.status),
          stockCount:
            entry.status === "limited"
              ? 3 + (service.slug.length % 9)
              : 40 + (service.slug.length % 60),
          avgDeliverySeconds: entry.avgDeliverySeconds,
          successRate: entry.successRate,
        })),
    );
  },

  async listOffersForService(serviceSlug: string): Promise<ProviderOffer[]> {
    // The mock catalog is small enough that "on demand" is just a filter
    // over the same data listOffers() already computes.
    const offers = await developmentProvider.listOffers();
    return offers.filter((offer) => offer.serviceSlug === serviceSlug);
  },

  async getLivePrice(serviceSlug: string, countrySlug: string): Promise<number | null> {
    // No real provider behind this data, so "live" just means "the same
    // fixed mock price", which is fine: the point of this adapter is a
    // stable demo, not staleness risk.
    const offers = await developmentProvider.listOffersForService(serviceSlug);
    const offer = offers.find(
      (o) => o.countrySlug === countrySlug && o.stock !== "out_of_stock",
    );
    return offer?.priceNaira ?? null;
  },

  async requestNumber(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<RequestedNumber> {
    const country = catalogCountries.find((c) => c.slug === countrySlug);
    const service = catalogServices.find((s) => s.slug === serviceSlug);
    const offer = service?.availability.find(
      (a) => a.countrySlug === countrySlug && a.status !== "unavailable",
    );

    if (!country || !service || !offer) {
      throw new ProviderError("No numbers left for that combination.", "out_of_stock");
    }

    const now = Date.now();
    const deliverInSeconds =
      MIN_DELIVERY_SECONDS +
      Math.floor(Math.random() * (MAX_DELIVERY_SECONDS - MIN_DELIVERY_SECONDS));
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const digits = NATIONAL_DIGITS[country.slug] ?? 10;

    return {
      externalId: encodeId(
        now + deliverInSeconds * 1000,
        now + SESSION_SECONDS * 1000,
        code,
      ),
      phoneNumber: `${country.dialCode}${randomDigits(digits)}`,
      sessionSeconds: SESSION_SECONDS,
    };
  },

  async checkSms(externalId: string): Promise<SmsStatus> {
    const decoded = decodeId(externalId);
    if (!decoded) return { state: "waiting" };

    const now = Date.now();
    if (now >= decoded.deliverAt) {
      return {
        state: "received",
        code: decoded.code,
        text: `Your verification code is ${decoded.code}. Do not share it with anyone.`,
      };
    }
    if (now >= decoded.expiresAt) return { state: "expired" };
    return { state: "waiting" };
  },

  async cancelNumber(): Promise<void> {
    // Nothing to release: the development adapter holds no inventory.
  },
};
