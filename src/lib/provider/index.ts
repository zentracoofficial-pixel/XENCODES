import { readProviderConfig } from "./config";
import { PROVIDER_DEFINITIONS, getProviderDefinition, ProviderConfigError } from "./registry";
import type { NumberProvider } from "./types";

export * from "./types";
export * from "./registry";
export * from "./config";

/**
 * Resolves the number supplier(s) Xencodes is buying from right now.
 *
 * The core application never asks "is this GrizzlySMS": every caller here,
 * in src/lib/inventory.ts, in src/app/dashboard/buy/actions.ts, and in the
 * admin, speaks only in terms of NumberProvider. Which concrete adapters
 * exist is registry.ts; which of them are switched on and in what order is
 * config.ts; this file is what turns those two into live adapter instances
 * a caller can actually use.
 *
 * More than one provider can be enabled at once. getEnabledProviders()
 * returns all of them, sorted by priority, so a caller that can meaningfully
 * try more than one (the catalog sync, the live pair quote in
 * inventory.ts) does. getNumberProvider() stays as a single-provider
 * convenience for callers that only need to know "is anything connected
 * at all" (the homepage's inventory status, the admin settings summary):
 * it resolves to the first enabled, connected provider by priority.
 */

export type ProviderResolution =
  | { connected: true; provider: NumberProvider }
  | {
      connected: false;
      reason: "no_adapter" | "disabled" | "not_configured" | "missing_credentials";
      /** What an admin has selected, even when it cannot be used yet. */
      configuredId?: string;
    };

/** Resolves exactly one provider by id, regardless of its enabled state in
 *  config. Used by the admin's "test connection" (which must be able to
 *  test a provider before switching it on) and by anything that already
 *  knows which provider fulfilled an order and needs that exact adapter
 *  back, not whichever one currently sorts first. */
export async function resolveProvider(id: string): Promise<ProviderResolution> {
  const definition = getProviderDefinition(id);
  if (!definition) return { connected: false, reason: "no_adapter", configuredId: id };

  try {
    return { connected: true, provider: definition.create() };
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      console.error(`[provider] "${id}" is not fully configured:`, error.message);
      return { connected: false, reason: "missing_credentials", configuredId: id };
    }
    throw error;
  }
}

export interface ResolvedProvider {
  id: string;
  label: string;
  priority: number;
  provider: NumberProvider;
}

/**
 * Every provider an admin has switched on and that actually has credentials
 * on this deployment, sorted lowest priority first (tried first). A
 * provider that is enabled but missing its credentials is logged and
 * skipped rather than included half-working: callers here can trust that
 * every entry returned is genuinely usable right now.
 */
export async function getEnabledProviders(): Promise<ResolvedProvider[]> {
  const config = await readProviderConfig();
  const enabled = config
    .filter((entry) => entry.enabled)
    .sort((a, b) => a.priority - b.priority);

  const resolved: ResolvedProvider[] = [];
  for (const entry of enabled) {
    const definition = getProviderDefinition(entry.id);
    if (!definition) continue;
    const resolution = await resolveProvider(entry.id);
    if (resolution.connected) {
      resolved.push({
        id: entry.id,
        label: definition.label,
        priority: entry.priority,
        provider: resolution.provider,
      });
    } else {
      console.error(
        `[provider] "${entry.id}" is enabled but not connected (${resolution.reason}); skipping it.`,
      );
    }
  }
  return resolved;
}

/**
 * The first enabled, connected provider by priority, or a specific reason
 * why nothing is available. For callers that only need one provider or
 * just want to know whether numbers can be sold at all right now: the
 * homepage's inventory status, the admin settings summary, and any caller
 * not yet migrated to reason about more than one provider.
 */
export async function getNumberProvider(): Promise<ProviderResolution> {
  const config = await readProviderConfig();
  const enabled = config.filter((entry) => entry.enabled).sort((a, b) => a.priority - b.priority);

  if (enabled.length === 0) return { connected: false, reason: "not_configured" };

  for (const entry of enabled) {
    const definition = getProviderDefinition(entry.id);
    if (!definition) continue;
    const resolution = await resolveProvider(entry.id);
    if (resolution.connected) return resolution;
  }

  // Every enabled entry failed to resolve: report the first one's own
  // reason, since that is the one an admin would look at first.
  const first = enabled[0];
  if (!getProviderDefinition(first.id)) {
    return { connected: false, reason: "no_adapter", configuredId: first.id };
  }
  return { connected: false, reason: "missing_credentials", configuredId: first.id };
}

/** Which adapters actually have an integration behind them, for the admin
 *  panel to render a row for even when disabled or unconfigured. */
export function availableAdapterIds(): string[] {
  return PROVIDER_DEFINITIONS.map((definition) => definition.id);
}

/** Whether an adapter's environment variable is actually set, independent
 *  of whether it is enabled. */
export function hasCredentials(adapterId: string): boolean {
  return getProviderDefinition(adapterId)?.hasCredentials() ?? false;
}

export function providerLabel(id: string): string {
  return getProviderDefinition(id)?.label ?? id;
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
