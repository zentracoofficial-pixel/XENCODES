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
 * 1. Money crossing this boundary is always a COST, in US cents, never a
 *    customer price and never in the customer's own currency: a supplier
 *    bills Xencodes in USD regardless of who a number is sold to. Turning
 *    that cost into a customer price, in a customer's own currency, is
 *    src/lib/pricing.ts's job and only its job.
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
  /**
   * The supplier's own id for this country, for example a numeric id in
   * GrizzlySMS's catalog. Shown only in the admin panel and recorded on the
   * order that bought it, the same way ProviderService.providerServiceId
   * is: never sent to a customer facing page, and never used as the
   * country's identity anywhere outside the adapter that issued it. Optional
   * because not every adapter necessarily has one worth showing.
   */
  providerCountryId?: string;
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
   * What the supplier bills Xencodes for this pair, in US cents. Always
   * USD, regardless of which currency the eventual customer pays in: a
   * provider bills Xencodes the same way no matter who the number is sold
   * to. Converting this into a customer's own currency is the pricing
   * engine's job (see quoteForCurrency() in src/lib/pricing.ts), never this
   * adapter's. Exact, never rounded to a tidy figure: rounding a cost down
   * is how an order ends up billing the business.
   */
  costUsdCents: number;
  stock: StockLevel;
  /** How many numbers the supplier reports, when it reports a count. */
  stockCount?: number;
  /** Share of recent activations that received a code, 0 to 100. Absent
   *  unless the supplier actually reports it. */
  successRate?: number;
  /**
   * Every price rung with numbers in stock right now, when the supplier sells
   * one pair from several sellers at several prices (see ProviderPool).
   * Present only when the supplier actually broke the pair down; absent for
   * a single-price pair. When present, `costUsdCents` is the price of the
   * rung this adapter would offer first and `stockCount` is the sum of these
   * rungs, so "in stock" means a rung really has numbers rather than the
   * supplier's own headline figure saying so. Unranked: choosing among them
   * (and what to try next when one runs dry) is src/lib/pool-ladder.ts.
   */
  pools?: ProviderPool[];
}

/**
 * One sellable service/country pair, carrying everything needed to write a
 * catalog row without a second lookup.
 *
 * Distinct from ProviderAvailability, which is scoped to a service the
 * caller already knows about and so only names the country. A bulk catalog
 * read has no such context: it is discovering both sides at once, so the
 * service travels with the pair.
 */
export interface ProviderCatalogEntry {
  service: ProviderService;
  country: ProviderCountry;
  /** What the supplier bills Xencodes for this pair, in US cents. Always
   *  USD; see ProviderAvailability.costUsdCents. */
  costUsdCents: number;
  stock: StockLevel;
  stockCount?: number;
}

/**
 * One real, distinct seller behind a single service+country pair, when a
 * provider's API exposes more than one — confirmed, from a live GrizzlySMS
 * response, to be exactly what its own site's multiple price points for one
 * country+service actually are (see getProviderPools()'s own comment in
 * src/lib/provider/grizzlysms.ts). Not a guess, not a quality score: just
 * the real id, cost and stock GrizzlySMS itself reports for that one seller.
 */
export interface ProviderPool {
  /** The provider's own id for this specific seller/pool — distinct from
   *  both the country id and the service id. Stored on the Activation that
   *  deliberately targeted it (see Activation.providerOfferId's own schema
   *  comment) so Xencodes' own outcomes can be tracked per pool, the real
   *  evidence src/lib/provider-pool-quality.ts uses to ever prefer one pool
   *  over another. */
  providerOfferId: string;
  costUsdCents: number;
  stockCount: number;
}

export interface PurchasedNumber {
  /** The supplier's own id for this order, kept for status polling. */
  providerOrderId: string;
  phoneNumber: string;
  /** How long the number stays held for this customer. */
  sessionSeconds: number;
  /** What the supplier says this number actually cost, in US cents, when its
   *  response states one. Lets a caller notice a supplier ignoring which
   *  seller was asked for. */
  costUsdCents?: number;
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
   * Reserves a number. `maxCostUsdCents`, when given, is an additional
   * provider-side safety rail on top of the cost check the caller already
   * performed a moment earlier: an adapter that can pass a price ceiling to
   * its supplier should, so a cost that rose in the instant between the
   * quote and this call is refused by the supplier itself rather than
   * silently paid. It is a backstop, not a substitute for the caller's own
   * check. In USD cents, the same currency every cost crossing this
   * boundary is in, regardless of what currency the customer is paying.
   *
   * `providerOfferId`, when given, asks the supplier for a number from that
   * one exact pool specifically (see ProviderPool), rather than whatever its
   * own default assignment would pick — set only when
   * src/lib/provider-pool-quality.ts's real, evidence-based comparison
   * found one pool with a confirmed, materially better delivery record than
   * the others, never as a default. An adapter with no such concept, or
   * whose API cannot target one, ignores it.
   */
  purchaseNumber(
    serviceSlug: string,
    countrySlug: string,
    maxCostUsdCents?: number,
    providerOfferId?: string,
  ): Promise<PurchasedNumber>;

  /** Polled while a customer waits. Carries the code once it arrives. */
  getOrderStatus(providerOrderId: string): Promise<ProviderOrderStatus>;

  /** Releases the number early. Suppliers usually refund on cancel. */
  cancelOrder(providerOrderId: string): Promise<void>;

  /**
   * Every sellable service/country pair the supplier currently offers, in
   * as few requests as the supplier's API allows.
   *
   * Exists because the catalog sync's only other option is calling
   * getCountries() once per service, and a real supplier catalog runs to
   * hundreds of services: that is hundreds of sequential round trips, which
   * on a serverless deployment means the sync is killed by the function
   * timeout before it ever finishes, and so never records a successful run
   * at all. An adapter whose API can answer "everything, at once" should
   * implement this so the sync costs a handful of requests rather than one
   * per service.
   *
   * Optional: an adapter with no bulk endpoint leaves it undefined and the
   * sync falls back to the per-service walk. Same data either way; this is
   * purely about how many requests it takes to collect it.
   */
  getFullCatalog?(): Promise<ProviderCatalogEntry[]>;

  /** Xencodes' remaining credit with the supplier, in US cents (suppliers
   *  in this space bill and hold balance in USD), when the supplier exposes
   *  it. Shown to the admin so a balance running out is visible before it
   *  stops sales. */
  getProviderBalanceUsdCents?(): Promise<number | null>;

  /** When the service and country catalog was last actually fetched from
   *  the supplier, or null before the first fetch. Read only, never
   *  triggers a fetch itself: the admin panel uses this to show how fresh
   *  what it is looking at is, without pretending every value is live to
   *  the second. */
  getCatalogSyncedAt?(): Date | null;

  /**
   * The cheapest cost, in US cents, at which each service is currently sold
   * anywhere, keyed by our service slug. Optional and best effort: an
   * adapter that already fetched pricing broadly for another reason can
   * offer this for free; one that would need a dedicated call per service
   * to build it should leave it undefined rather than making an admin
   * listing page trigger one provider request per row.
   */
  getCheapestCostByService?(): Promise<Map<string, number>>;

  /**
   * How many countries currently have at least one service in stock,
   * counted from the whole catalog in one pass rather than assembled by
   * asking per service. Optional and best effort, for the same reason as
   * getCheapestCostByService: a homepage "locations" figure is not worth
   * one provider request per service. Does not subtract services an admin
   * has disabled on the Xencodes side, since the supplier has no notion of
   * that; treat it as "countries the supplier can sell in", not an exact
   * count of what is on sale this second.
   */
  getCountryCount?(): Promise<number>;

  /**
   * A real, safe, read-only request to the supplier, used only to answer
   * "does this connection actually work" from the admin panel. Must never
   * reserve a number, spend balance, or have any other side effect. Optional
   * because an adapter with no cheap read-only call can leave this
   * undefined; the admin then falls back to treating a successful
   * getServices() call as the test.
   */
  testConnection?(): Promise<{ ok: boolean; message: string }>;

  /**
   * Read-only, admin-triggered only, never part of the normal sync or
   * purchase path: asks the supplier directly, for one exact service and
   * country, whatever richer price/quality information its API exposes
   * beyond the single cost this adapter normally reads — and returns the
   * raw answer verbatim rather than a parsed shape, since the whole point is
   * finding out what that answer actually looks like before any code is
   * written against an assumed one. Optional: an adapter nobody has asked
   * this question of yet can leave it undefined.
   */
  debugPriceTiers?(serviceSlug: string, countrySlug: string): Promise<string>;

  /**
   * The real per-seller breakdown behind one exact service+country, when
   * this provider's API exposes one (see ProviderPool's own comment).
   * Returns null — never an empty/guessed result — when the provider has no
   * such concept, or this exact pair happens not to have more than one pool
   * right now: every caller treats null as "nothing to choose between,
   * price and buy exactly as before this existed." Optional for the same
   * reason debugPriceTiers is.
   */
  getProviderPools?(serviceSlug: string, countrySlug: string): Promise<ProviderPool[] | null>;

  /**
   * The in-stock price rungs (see ProviderPool) for EVERY country of one
   * service, keyed by our country slug, in one request. Exists so a country
   * list can show the price a customer will actually be quoted on picking a
   * country, rather than the supplier's headline "from" price: a customer
   * who compares the list with the quote and finds them different stops
   * trusting either. A country mapped to an empty array has no rung with
   * stock. A country absent from the map has no breakdown (single price):
   * keep its own figures. Null when the supplier cannot answer at all.
   * Optional, and best effort: callers fall back to getCountries() prices.
   */
  getServiceLadder?(serviceSlug: string): Promise<Map<string, ProviderPool[]> | null>;
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
