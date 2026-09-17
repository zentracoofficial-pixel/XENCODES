import {
  readSettings,
  readNumber,
  SETTING_KEYS,
  DEFAULT_USD_TO_NGN_RATE,
} from "@/lib/settings";
import { GrizzlySmsProvider } from "./grizzlysms";
import type { NumberProvider } from "./types";

export * from "./types";

/**
 * Resolves the number supplier Xencodes is using right now.
 *
 * There is no supplier connected. Xencodes previously bought from one and
 * no longer does, and the replacement has not been chosen, so every call
 * below reports "not connected" and the product says so plainly rather
 * than inventing inventory to fill the gap.
 *
 * Connecting the next one is two steps and touches nothing else:
 *
 * 1. Write an adapter implementing NumberProvider in this folder. Its
 *    credentials come from the environment, never from the database, so a
 *    production secret is never stored where the admin panel could read it
 *    back.
 * 2. Register it in ADAPTERS below under the id an admin selects in
 *    Settings.
 *
 * Nothing outside this folder changes: the buy flow, pricing, orders and
 * admin all already speak the NumberProvider interface.
 */

/**
 * One entry per adapter with a real integration behind it. A factory reads
 * its own credentials from the environment; only the non-secret base URL
 * is passed in from here, and Settings never sees the key itself.
 *
 * "grizzlysms" needs GRIZZLYSMS_API_KEY set as an environment variable on
 * this deployment. With no key set, resolving it throws "not_configured"
 * rather than starting an adapter with an empty key that would fail on its
 * first real call, which is a substantially worse failure mode: a request
 * that quietly waits on a network call before reporting "no provider" is
 * indistinguishable from "the provider is slow" until it times out.
 */
const ADAPTERS: Record<string, (usdToNgnRate: number) => NumberProvider> = {
  grizzlysms: (usdToNgnRate) => {
    const apiKey = process.env.GRIZZLYSMS_API_KEY;
    if (!apiKey) {
      throw new ProviderConfigError(
        "GRIZZLYSMS_API_KEY is not set as an environment variable on this deployment.",
      );
    }
    return new GrizzlySmsProvider({ apiKey, usdToNgnRate });
  },
};

/** Thrown by a factory when its required environment variable is missing.
 *  Caught in getNumberProvider() and turned into a resolution an admin can
 *  actually act on, rather than a 500 the first time a page resolves it. */
class ProviderConfigError extends Error {}

/** Which adapters actually have an integration behind them. Empty today,
 *  which is what the admin panel reports rather than implying otherwise. */
export function availableAdapterIds(): string[] {
  return Object.keys(ADAPTERS);
}

/**
 * Whether an adapter's environment variable is actually set, independent of
 * the enabled toggle. Settings shows this so a disabled connection with a
 * missing key still reads as "credentials missing" rather than looking
 * identical to one that would work the moment it is switched on.
 *
 * Duplicates each factory's own check rather than instantiating it, since
 * instantiating just to test for a thrown error would run every adapter's
 * constructor for a page that only wants to know one boolean.
 */
export function hasCredentials(adapterId: string): boolean {
  if (adapterId === "grizzlysms") return Boolean(process.env.GRIZZLYSMS_API_KEY);
  return false;
}

export type ProviderResolution =
  | { connected: true; provider: NumberProvider }
  | {
      connected: false;
      reason: "no_adapter" | "disabled" | "not_configured" | "missing_credentials";
      /** What an admin has selected, even when it cannot be used yet. */
      configuredId?: string;
    };

export async function getNumberProvider(): Promise<ProviderResolution> {
  const settings = await readSettings();

  const configuredId = settings[SETTING_KEYS.providerId]?.trim();
  const enabled = settings[SETTING_KEYS.providerEnabled] === "true";
  const usdToNgnRate = readNumber(
    settings,
    SETTING_KEYS.usdToNgnRate,
    DEFAULT_USD_TO_NGN_RATE,
  );

  if (!configuredId) return { connected: false, reason: "not_configured" };
  if (!enabled) return { connected: false, reason: "disabled", configuredId };

  const factory = ADAPTERS[configuredId];
  if (!factory) return { connected: false, reason: "no_adapter", configuredId };

  try {
    return { connected: true, provider: factory(usdToNgnRate) };
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      console.error(`[provider] "${configuredId}" is not fully configured:`, error.message);
      return { connected: false, reason: "missing_credentials", configuredId };
    }
    throw error;
  }
}

/** Wording for the one place a customer sees this, and for the admin. */
export const PROVIDER_UNAVAILABLE_COPY: Record<
  Exclude<ProviderResolution, { connected: true }>["reason"],
  string
> = {
  not_configured: "No number provider is connected yet.",
  disabled: "The number provider connection is switched off.",
  no_adapter: "The selected number provider has no integration built yet.",
  missing_credentials:
    "The number provider is selected but its credentials are not configured on this deployment.",
};
