import { GrizzlySmsProvider } from "./grizzlysms";
import type { NumberProvider } from "./types";

/**
 * What one adapter actually implements. Derived once here, from the same
 * facts NumberProvider's own optional methods already encode, so the admin
 * panel and the sync/purchase paths have one place to ask "can this
 * provider do X" rather than each guessing from method presence themselves.
 *
 * `purchase`, `smsRetrieval`, `activationStatus` and `cancellation` are not
 * listed as capabilities: every adapter must implement them, because there
 * is no way to sell a number at all without them. What varies between
 * suppliers is the optional, best-effort surface: a bulk catalog read, a
 * balance figure, a synced-at timestamp, cheapest-cost/country-count
 * shortcuts, and a real connection test.
 */
export interface ProviderCapabilities {
  /** Can fetch its whole catalog in a bounded number of requests, which is
   *  what makes a background sync viable at all on a serverless timeout. */
  bulkCatalog: boolean;
  /** Reports a live account balance. */
  balance: boolean;
  /** Exposes when its own catalog was last actually fetched. */
  catalogFreshness: boolean;
  /** Can answer a real, safe "is this connection working" request. */
  connectionTest: boolean;
}

function capabilitiesOf(provider: {
  getFullCatalog?: unknown;
  getProviderBalanceUsdCents?: unknown;
  getCatalogSyncedAt?: unknown;
  testConnection?: unknown;
}): ProviderCapabilities {
  return {
    bulkCatalog: typeof provider.getFullCatalog === "function",
    balance: typeof provider.getProviderBalanceUsdCents === "function",
    catalogFreshness: typeof provider.getCatalogSyncedAt === "function",
    connectionTest: typeof provider.testConnection === "function",
  };
}

/** Thrown by a factory when its required environment variable is missing.
 *  Caught by the resolver in ./index.ts and turned into a resolution an
 *  admin can act on, rather than a 500 the first time a page resolves it. */
export class ProviderConfigError extends Error {}

export interface ProviderDefinition {
  /** Stable id, used in the admin panel, in settings, and stored on every
   *  order this provider fulfils. Never renamed once anything has ordered
   *  through it: historical orders carry this string forever. */
  id: string;
  label: string;
  /** Non-secret environment variable name(s) this provider reads its own
   *  credentials from. Shown in the admin panel as names only, never as
   *  values: nothing here can display a key even if it wanted to. */
  envVarNames: string[];
  /** Whether every env var this provider needs is actually set on this
   *  deployment, independent of whether an admin has enabled it. */
  hasCredentials: () => boolean;
  /** Builds a live adapter instance. Reads its own credentials from
   *  process.env; throws ProviderConfigError when one is missing rather
   *  than starting an adapter that would fail on its first real call. An
   *  adapter never takes a currency or exchange rate: it only ever reports
   *  cost in US cents (see src/lib/provider/types.ts), so nothing about
   *  currency configuration belongs in how one is built. */
  create: () => NumberProvider;
}

/**
 * Every provider Xencodes knows how to talk to.
 *
 * Adding a second provider is exactly one entry here plus one adapter file
 * under src/lib/provider/<name>/ (or, for a small adapter, one file the way
 * grizzlysms.ts is today): implement NumberProvider, read its own
 * credentials from its own environment variable, and register it below.
 * Nothing outside this file and the admin's enable/priority toggle needs to
 * change for the rest of the application to be able to sell through it.
 */
export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "grizzlysms",
    label: "GrizzlySMS",
    envVarNames: ["GRIZZLYSMS_API_KEY"],
    hasCredentials: () => Boolean(process.env.GRIZZLYSMS_API_KEY),
    create: () => {
      const apiKey = process.env.GRIZZLYSMS_API_KEY;
      if (!apiKey) {
        throw new ProviderConfigError(
          "GRIZZLYSMS_API_KEY is not set as an environment variable on this deployment.",
        );
      }
      return new GrizzlySmsProvider({ apiKey });
    },
  },

  // To add a second provider:
  //   1. Write providers/<id>.ts implementing NumberProvider, converting
  //      every response into Service/Country/ProviderAvailability/etc, the
  //      same way grizzlysms.ts does.
  //   2. Add its own <ID>_API_KEY environment variable and read it only
  //      inside that adapter's create(), never here or anywhere else.
  //   3. Append one entry to this array.
  //   4. Enable it and set its priority on /admin/providers.
  //   5. Run a catalog sync (scheduled, or "Sync now" for that provider).
  // Nothing in the homepage, search, dashboard, wallet, orders, pricing
  // engine, or admin users/customer UI needs to change.
];

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((definition) => definition.id === id);
}

export function getProviderCapabilities(provider: NumberProvider): ProviderCapabilities {
  return capabilitiesOf(provider);
}
