import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import {
  PROVIDER_DEFINITIONS,
  readProviderConfig,
  resolveProvider,
  getProviderCapabilities,
} from "@/lib/provider";
import { getAllProviderSyncStatuses } from "@/lib/provider-sync";
import { ProviderCard } from "./provider-card";
import { SyncAllButton } from "./sync-all-button";

export const metadata: Metadata = { title: "Admin: Providers" };

// Resolving this page makes a real outbound request per credentialed
// provider (to test whether it actually connects), which must never run at
// build time.
export const dynamic = "force-dynamic";

// "Test connection" and "Sync now" are server actions invoked from this
// page, so they run under this route's own limit rather than the cron
// route's. 60 is the ceiling Vercel's Hobby plan allows for any function;
// declaring more fails the build.
export const maxDuration = 60;

/**
 * Every SMS number provider Xencodes knows how to talk to (registry.ts),
 * whether or not it is currently enabled or even has credentials on this
 * deployment, so a newly registered provider shows up here the moment its
 * code ships. GrizzlySMS is Provider 1: live, fully working, unaffected by
 * anything on this page until an admin actually changes its settings.
 *
 * Adding "Provider 2" is: write its adapter, register it in
 * src/lib/provider/registry.ts, set its own <ID>_API_KEY on this
 * deployment, then enable it and set its priority right here.
 */
export default async function AdminProvidersPage() {
  await requireAdmin();

  const [config, statuses] = await Promise.all([
    readProviderConfig(),
    getAllProviderSyncStatuses(),
  ]);
  const configById = new Map(config.map((entry) => [entry.id, entry]));

  const rows = await Promise.all(
    PROVIDER_DEFINITIONS.map(async (definition) => {
      const entry = configById.get(definition.id) ?? {
        id: definition.id,
        enabled: false,
        priority: 0,
      };
      const hasCredentials = definition.hasCredentials();
      // Resolved regardless of the enabled toggle: an admin needs to be
      // able to confirm a connection works before switching it on for
      // customers, not only after.
      const resolution = hasCredentials ? await resolveProvider(definition.id) : null;
      const status = statuses.get(definition.id) ?? null;

      return {
        id: definition.id,
        label: definition.label,
        envVarNames: definition.envVarNames,
        enabled: entry.enabled,
        priority: entry.priority,
        hasCredentials,
        connected: resolution?.connected === true,
        capabilities:
          resolution?.connected === true ? getProviderCapabilities(resolution.provider) : null,
        status: status
          ? {
              lastSuccessAt: status.lastSuccessAt?.toISOString() ?? null,
              lastFailureAt: status.lastFailureAt?.toISOString() ?? null,
              lastFailureError: status.lastFailureError,
              servicesSynced: status.servicesSynced,
              countriesSynced: status.countriesSynced,
              offersSynced: status.offersSynced,
              isFresh: status.isFresh,
            }
          : null,
      };
    }),
  );

  rows.sort((a, b) => a.priority - b.priority);
  const enabledCount = rows.filter((row) => row.enabled && row.connected).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every number supplier Xencodes can buy from. When more than one is enabled for the
            same service and country, the cheapest available one is used, with priority below as
            the tie-break; a provider that is down or out of stock for a pair is simply skipped in
            favour of the next.{" "}
            {enabledCount > 0
              ? `${enabledCount} provider${enabledCount === 1 ? "" : "s"} live right now.`
              : "None are live right now."}
          </p>
        </div>
        <SyncAllButton />
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <ProviderCard key={row.id} {...row} />
        ))}
      </div>
    </div>
  );
}
