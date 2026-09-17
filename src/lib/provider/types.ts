/**
 * The contract between Xencodes and whichever external company supplies the
 * phone numbers.
 *
 * Nothing outside src/lib/provider knows which company that is. Pages, the
 * purchase action, the admin panel and the pricing engine all deal in the
 * types below, so choosing a supplier means writing one adapter rather than
 * touching the product.
 *
 * Two rules the shape of this file exists to enforce:
 *
 * 1. Money crossing this boundary is always a COST, in kobo, never a
 *    customer price. Turning a cost into a price is src/lib/pricing.ts's
 *    job and only its job.
 * 2. An adapter reports what the supplier actually said. Where the supplier
 *    reports nothing, the field is absent. Filling in a plausible-looking
 *    value reads to a customer as a measurement, and it is not one.
 */

export type StockLevel = "in_stock" | "low" | "out_of_stock";

export interface ProviderService {
  /**
   * Our stable identifier, used in URLs and stored on orders, for example
   * "instagram". Derived from the supplier's own service by the adapter.
   * The supplier's identifier stays inside the adapter: it never reaches
   * the browser, and it is never modified.
   */
  slug: string;
  name: string;
  /** Brand colour for the logo glyph. */
  color: string;
  /** Grouping used to organise the services directory. */
  category: string;
  /**
   * The supplier's own code for this service, for example "wa". Shown only
   * in the admin panel, where an operator reconciling with the supplier's
   * own dashboard needs it; never sent to a customer facing page. Optional
   * because not every adapter necessarily has a separate code worth
   * showing.
   */
  providerServiceId?: string;
}

export interface ProviderCountry {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  /** Digit count after the dial code, used to render a number format hint. */
  nationalDigits: number;
}

/**
 * What one service costs in one country, right now.
 *
 * The country's display details travel with its availability rather than
 * being looked up separately. A supplier that can quote a country can
 * always name it, and keeping them together means no caller can end up
 * holding a price it cannot label.
 */
export interface ProviderAvailability {
  serviceSlug: string;
  country: ProviderCountry;
  /**
   * What the supplier bills Xencodes for this pair, in kobo. Exact, never
   * rounded to a tidy figure: rounding a cost down is how an order ends up
   * billing the business.
   */
  costKobo: number;
  stock: StockLevel;
  /** How many numbers the supplier reports, when it reports a count. */
  stockCount?: number;
  /** Share of recent activations that received a code, 0 to 100. Absent
   *  unless the supplier actually reports it. */
  successRate?: number;
}

export interface PurchasedNumber {
  /** The supplier's own id for this order, kept for status polling. */
  providerOrderId: string;
  phoneNumber: string;
  /** How long the number stays held for this customer. */
  sessionSeconds: number;
}

/**
 * Suppliers report more than "worked" and "did not", and folding those into
 * one failure state loses the distinction that matters most: whether the
 * supplier has already refunded itself, which changes what Xencodes owes
 * the customer.
 *
 * The received state carries the code, so asking for an order's status and
 * asking for its verification code are the same call. Every supplier
 * answers both in one response, and splitting them into two methods would
 * mean two round trips for one fact.
 */
export type ProviderOrderStatus =
  | { state: "waiting" }
  | { state: "received"; code: string; text?: string }
  | { state: "expired" }
  | { state: "refunded" }
  | { state: "cancelled" };

export interface NumberProvider {
  /** Identifies the adapter in the admin panel and in logs. */
  readonly id: string;
  readonly label: string;

  getServices(): Promise<ProviderService[]>;

  /**
   * The countries this one service can be bought in, priced. Pairs with no
   * stock are omitted rather than returned as unavailable, so a picker
   * built from this cannot offer something that fails at purchase.
   *
   * An adapter is free to cache this for a few minutes so pages stay fast.
   */
  getCountries(serviceSlug: string): Promise<ProviderAvailability[]>;

  /**
   * One exact pair, with its cost, fetched fresh with no cache in the way.
   * Null when it cannot be bought right now.
   *
   * This is the one call an adapter must never cache: it is what a purchase
   * is validated against in the moment before money moves, so a cached cost
   * that has since risen cannot be sold at the old figure. It answers both
   * "can this be bought" and "what does it cost", because every supplier
   * answers both in one response and asking twice would mean two round
   * trips for one fact.
   */
  getAvailability(
    serviceSlug: string,
    countrySlug: string,
  ): Promise<ProviderAvailability | null>;

  /**
   * Reserves a number. `maxCostKobo`, when given, is an additional
   * provider-side safety rail on top of the cost check the caller already
   * performed a moment earlier: an adapter that can pass a price ceiling to
   * its supplier should, so a cost that rose in the instant between the
   * quote and this call is refused by the supplier itself rather than
   * silently paid. It is a backstop, not a substitute for the caller's own
   * check.
   */
  purchaseNumber(
    serviceSlug: string,
    countrySlug: string,
    maxCostKobo?: number,
  ): Promise<PurchasedNumber>;

  /** Polled while a customer waits. Carries the code once it arrives. */
  getOrderStatus(providerOrderId: string): Promise<ProviderOrderStatus>;

  /** Releases the number early. Suppliers usually refund on cancel. */
  cancelOrder(providerOrderId: string): Promise<void>;

  /** Xencodes' remaining credit with the supplier, in kobo, when the
   *  supplier exposes it. Shown to the admin so a balance running out is
   *  visible before it stops sales. */
  getProviderBalanceKobo?(): Promise<number | null>;

  /** When the service and country catalog was last actually fetched from
   *  the supplier, or null before the first fetch. Read only, never
   *  triggers a fetch itself: the admin panel uses this to show how fresh
   *  what it is looking at is, without pretending every value is live to
   *  the second. */
  getCatalogSyncedAt?(): Date | null;

  /**
   * The cheapest cost, in kobo, at which each service is currently sold
   * anywhere, keyed by our service slug. Optional and best effort: an
   * adapter that already fetched pricing broadly for another reason can
   * offer this for free; one that would need a dedicated call per service
   * to build it should leave it undefined rather than making an admin
   * listing page trigger one provider request per row.
   */
  getCheapestCostByService?(): Promise<Map<string, number>>;
}

/** Thrown when the supplier refuses a request, so callers can react. */
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
