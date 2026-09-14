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
  /**
   * What the provider charges Xencodes for this pair, in kobo. This is a
   * cost, never a customer price: turning it into something a customer
   * pays is src/lib/pricing.ts's job and only its job. Kept exact rather
   * than rounded to a tidy figure, because rounding a cost down is how a
   * sale ends up below what the provider actually bills.
   */
  costKobo: number;
  stock: StockLevel;
  /** How many numbers the provider reports, when it reports a count. */
  stockCount?: number;
  /**
   * Typical time from purchase to code, in seconds. Optional on purpose:
   * only set it from a figure the provider actually reports. An adapter
   * that has no such figure must leave it undefined rather than filling in
   * a plausible-looking constant, which would read to a customer as a
   * measurement of this exact country when it is nothing of the sort.
   */
  avgDeliverySeconds?: number;
  /** Share of recent activations that received a code, 0 to 100. Optional
   *  for the same reason as avgDeliverySeconds: never invented. */
  successRate?: number;
}

export interface RequestedNumber {
  /** The provider's own id for this activation, kept for later polling. */
  externalId: string;
  phoneNumber: string;
  /** How long the number stays held for this customer. */
  sessionSeconds: number;
}

/**
 * Providers report more than "worked" and "did not". SMSPool alone
 * documents pending, activating, processing, completed, expired,
 * cancelled and refunded, and folding those into a single failure state
 * loses the distinction that matters most: whether the provider already
 * refunded itself, which changes what Xencodes owes the customer.
 *
 * "refunded" is kept separate from "expired" for exactly that reason.
 * Both end the activation and both return the customer's money, but only
 * one of them means the provider has already returned ours.
 */
export type SmsStatus =
  | { state: "waiting" }
  | { state: "received"; code: string; text?: string }
  | { state: "expired" }
  | { state: "refunded" }
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

  /**
   * The provider's current cost for one pair, in kobo, fetched fresh with
   * no caching, or null when the pair cannot be bought right now.
   *
   * Every other lookup here is cached for minutes at a time so pages stay
   * fast. This one deliberately is not: it is what a purchase is validated
   * against immediately before money moves, so that a cached price that
   * has since gone up cannot be sold at the old figure.
   */
  getLiveCostKobo(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<number | null>;

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
