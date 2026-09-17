import { readSettings, SETTING_KEYS } from "@/lib/settings";
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
 * Empty on purpose. An adapter id appearing here is what makes it usable,
 * and an id with no entry resolves to "no_adapter" rather than to
 * something that pretends to work. A factory reads its own credentials
 * from the environment; only the non-secret base URL is passed in.
 */
const ADAPTERS: Record<string, (baseUrl: string) => NumberProvider> = {};

/** Which adapters actually have an integration behind them. Empty today,
 *  which is what the admin panel reports rather than implying otherwise. */
export function availableAdapterIds(): string[] {
  return Object.keys(ADAPTERS);
}

export type ProviderResolution =
  | { connected: true; provider: NumberProvider }
  | {
      connected: false;
      reason: "no_adapter" | "disabled" | "not_configured";
      /** What an admin has selected, even when it cannot be used yet. */
      configuredId?: string;
    };

export async function getNumberProvider(): Promise<ProviderResolution> {
  const settings = await readSettings();

  const configuredId = settings[SETTING_KEYS.providerId]?.trim();
  const baseUrl = settings[SETTING_KEYS.providerBaseUrl]?.trim() ?? "";
  const enabled = settings[SETTING_KEYS.providerEnabled] === "true";

  if (!configuredId) return { connected: false, reason: "not_configured" };
  if (!enabled) return { connected: false, reason: "disabled", configuredId };

  const factory = ADAPTERS[configuredId];
  if (!factory) return { connected: false, reason: "no_adapter", configuredId };

  return { connected: true, provider: factory(baseUrl) };
}

/** Wording for the one place a customer sees this, and for the admin. */
export const PROVIDER_UNAVAILABLE_COPY: Record<
  Exclude<ProviderResolution, { connected: true }>["reason"],
  string
> = {
  not_configured: "No number provider is connected yet.",
  disabled: "The number provider connection is switched off.",
  no_adapter: "The selected number provider has no integration built yet.",
};
