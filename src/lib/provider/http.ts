import type {
  NumberProvider,
  ProviderCountry,
  ProviderOffer,
  ProviderService,
  RequestedNumber,
  SmsStatus,
} from "./types";
import { ProviderError } from "./types";

/**
 * Adapter for a live HTTP provider.
 *
 * The transport is finished: authentication, timeouts, JSON parsing and error
 * mapping all work. What stays open is the shape of the responses, because
 * that differs per provider. Each `map*` function below is the single place to
 * adjust when the provider is chosen, and nothing outside this file needs to
 * change.
 *
 * Until the response mapping is confirmed against the real API, an enabled
 * provider that returns an unexpected shape fails loudly rather than showing
 * a customer numbers that do not exist.
 */

interface HttpProviderConfig {
  label: string;
  baseUrl: string;
  apiKey: string;
}

const REQUEST_TIMEOUT_MS = 12_000;

export class HttpProvider implements NumberProvider {
  readonly id = "http";
  readonly isLive = true;
  readonly label: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: HttpProviderConfig) {
    this.label = config.label;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new ProviderError("The provider rejected the API key.", "rejected");
      }
      if (response.status === 404) {
        throw new ProviderError("No numbers left for that combination.", "out_of_stock");
      }
      if (!response.ok) {
        throw new ProviderError(
          `Provider responded with ${response.status}.`,
          "unknown",
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError("The provider did not respond in time.", "network");
      }
      throw new ProviderError("Could not reach the provider.", "network");
    } finally {
      clearTimeout(timeout);
    }
  }

  async listServices(): Promise<ProviderService[]> {
    const data = await this.call<unknown>("/services");
    return mapServices(data);
  }

  async listCountries(): Promise<ProviderCountry[]> {
    const data = await this.call<unknown>("/countries");
    return mapCountries(data);
  }

  async listOffers(): Promise<ProviderOffer[]> {
    const data = await this.call<unknown>("/prices");
    return mapOffers(data);
  }

  /**
   * Safe generic default: filters the same full listOffers() call locally.
   * Fine as long as this provider's whole catalog is small enough to price
   * eagerly. If it is not (SMSPool-sized), override this with a real
   * per-service endpoint the same way SmsPoolProvider does, so a service
   * outside whatever listOffers() eagerly prices can still be looked up.
   */
  async listOffersForService(serviceSlug: string): Promise<ProviderOffer[]> {
    const offers = await this.listOffers();
    return offers.filter((offer) => offer.serviceSlug === serviceSlug);
  }

  /**
   * Safe generic default, same caveat as listOffersForService(): this reuses
   * the cached full listing rather than a genuinely uncached single-pair
   * call. Fine for a small catalog; a provider large enough to need
   * listOffersForService's on-demand override should get a real uncached
   * price endpoint wired in here too before it is trusted for charging.
   */
  async getLivePrice(serviceSlug: string, countrySlug: string): Promise<number | null> {
    const offers = await this.listOffersForService(serviceSlug);
    const offer = offers.find(
      (o) => o.countrySlug === countrySlug && o.stock !== "out_of_stock",
    );
    return offer?.priceNaira ?? null;
  }

  async requestNumber(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<RequestedNumber> {
    const data = await this.call<unknown>("/activations", {
      method: "POST",
      body: JSON.stringify({ service: serviceSlug, country: countrySlug }),
    });
    return mapRequestedNumber(data);
  }

  async checkSms(externalId: string): Promise<SmsStatus> {
    const data = await this.call<unknown>(
      `/activations/${encodeURIComponent(externalId)}`,
    );
    return mapSmsStatus(data);
  }

  async cancelNumber(externalId: string): Promise<void> {
    await this.call(`/activations/${encodeURIComponent(externalId)}/cancel`, {
      method: "POST",
    });
  }
}

/*
 * Response mapping.
 *
 * Replace the bodies below with the chosen provider's field names. They throw
 * by default so an unmapped provider cannot silently serve wrong data.
 */

function unmapped(what: string, data: unknown): never {
  const shape = Array.isArray(data)
    ? `array of ${data.length}`
    : typeof data === "object" && data !== null
      ? `object with keys ${Object.keys(data).slice(0, 8).join(", ")}`
      : typeof data;

  throw new ProviderError(
    `Response mapping for ${what} is not set up for this provider yet. ` +
      `The provider returned ${shape}. Fill in the map functions in ` +
      `src/lib/provider/http.ts.`,
    "not_configured",
  );
}

function mapServices(data: unknown): ProviderService[] {
  return unmapped("services", data);
}

function mapCountries(data: unknown): ProviderCountry[] {
  return unmapped("countries", data);
}

function mapOffers(data: unknown): ProviderOffer[] {
  return unmapped("prices", data);
}

function mapRequestedNumber(data: unknown): RequestedNumber {
  return unmapped("number requests", data);
}

function mapSmsStatus(data: unknown): SmsStatus {
  return unmapped("SMS status", data);
}
