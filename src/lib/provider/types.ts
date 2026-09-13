/**
 * The contract between Xencodes and whichever external SMS provider supplies
 * the numbers.
 *
 * Everything the product shows a customer (which services exist, which
 * countries have stock, what a number costs, what code arrived) comes through
 * this interface. Adding a real provider means writing one adapter, not
 * touching the pages.
 *
 * Prices crossing this boundary are always whole Naira. Conversion to kobo
 * happens once, at purchase.
 */

export type StockLevel = "in_stock" | "low" | "out_of_stock";

export interface ProviderService {
  /** Stable identifier used in URLs, for example "instagram". */
  slug: string;
  name: string;
  /** Brand colour for the logo glyph. */
  color: string;
  /** Grouping used only to organise the services page. */
  category: string;
}

export interface ProviderCountry {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  /** Digit count after the dial code, used to render a number format hint. */
  nationalDigits: number;
}

/** One buyable combination: this service, in this country, right now. */
export interface ProviderOffer {
  serviceSlug: string;
  countrySlug: string;
  priceNaira: number;
  stock: StockLevel;
  /** How many numbers the provider reports, when it reports a count. */
  stockCount?: number;
  /** Typical time from purchase to code, in seconds. */
  avgDeliverySeconds: number;
  /** Share of recent activations that received a code, 0 to 100. */
  successRate: number;
}

export interface RequestedNumber {
  /** The provider's own id for this activation, kept for later polling. */
  externalId: string;
  phoneNumber: string;
  /** How long the number stays held for this customer. */
  sessionSeconds: number;
}

export type SmsStatus =
  | { state: "waiting" }
  | { state: "received"; code: string; text?: string }
  | { state: "expired" }
  | { state: "cancelled" };

export interface NumberProvider {
  /** Identifies the adapter in the admin panel and in logs. */
  readonly id: string;
  readonly label: string;
  /** False for the development adapter, so the UI can say so plainly. */
  readonly isLive: boolean;

  listServices(): Promise<ProviderService[]>;
  listCountries(): Promise<ProviderCountry[]>;
  /** Every buyable combination. Callers filter by service or country. */
  listOffers(): Promise<ProviderOffer[]>;
  /**
   * Offers for just this one service, across every country. For a provider
   * whose catalog is far larger than what listOffers() eagerly prices (see
   * SmsPoolProvider), this is how a service outside that eagerly-priced set
   * still becomes buyable: fetched live, on demand, only when a customer
   * actually selects it, rather than upfront for the entire catalog.
   */
  listOffersForService(serviceSlug: string): Promise<ProviderOffer[]>;

  requestNumber(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<RequestedNumber>;

  /** Polled by the activation view until a code arrives or time runs out. */
  checkSms(externalId: string): Promise<SmsStatus>;

  /** Releases the number early. Providers usually refund on cancel. */
  cancelNumber(externalId: string): Promise<void>;
}

/** Thrown when the provider refuses a request, so callers can react. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "out_of_stock"
      | "not_configured"
      | "rejected"
      | "network"
      | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
