import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import {
  PROVIDER_DEFINITIONS,
  readProviderConfig,
  resolveProvider,
  getProviderCapabilities,
} from "@/lib/provider";
import { getAllProviderSyncStatuses } from "@/lib/provider-sync";
import { listFlaggedFailures } from "@/lib/provider-failure-stats";
import { getQualityReport } from "@/lib/deliverability";
import { getPoolQualityReport, getSellerDeliveryReport } from "@/lib/provider-pool-quality";
import { ProviderCard } from "./provider-card";
import { SyncAllButton } from "./sync-all-button";
import { FlaggedFailuresCard } from "./flagged-failures-card";
import { QualityReportCard } from "./quality-report-card";
import { PoolQualityReportCard } from "./pool-quality-report-card";
import { SellerDeliveryCard } from "./seller-delivery-card";
import { PriceTierDiagnosticCard } from "./price-tier-diagnostic-card";
import { SmartPickupCard } from "./smart-pickup-card";
import { readSmartPickupSettings, getProviderPerformance, listAmbiguousAttempts } from "@/lib/smart-pickup";

/** Admin-only names for the servers; customers only ever see Xencodes. */
const SERVER_NAME: Record<string, string> = { grizzlysms: "Server I", dogesms: "Server II" };

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

  const smartPickup = await readSmartPickupSettings();
  const providerIds = PROVIDER_DEFINITIONS.map((definition) => definition.id);
  const [config, statuses, flagged, quality, poolQuality, sellerDelivery, performance, ambiguous] = await Promise.all([
    readProviderConfig(),
    getAllProviderSyncStatuses(),
    listFlaggedFailures(),
    getQualityReport(),
    getPoolQualityReport(),
    getSellerDeliveryReport(),
    getProviderPerformance(providerIds, smartPickup.windowDays),
    listAmbiguousAttempts(),
  ]);
  const displayLabel = (id: string) => {
    const label = PROVIDER_DEFINITIONS.find((definition) => definition.id === id)?.label ?? id;
    return SERVER_NAME[id] ? `${SERVER_NAME[id]} · ${label}` : label;
  };
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
        label: displayLabel(definition.id),
        envVarNames: definition.envVarNames,
        enabled: entry.enabled,
        priority: entry.priority,
        hasCredentials,
        connected: resolution?.connected === true,
        capabilities:
          resolution?.connected === true ? getProviderCapabilities(resolution.provider) : null,
        supportsPriceDiagnostic:
          resolution?.connected === true && typeof resolution.provider.debugPriceTiers === "function",
        status: status
          ? {
              lastSuccessAt: status.lastSuccessAt?.toISOString() ?? null,
              lastFailureAt: status.lastFailureAt?.toISOString() ?? null,
              lastFailureError: status.lastFailureError,
              servicesSynced: status.servicesSynced,
              countriesSynced: status.countriesSynced,
              offersSynced: status.offersSynced,
              isFresh: status.isFresh,
              runningSince: status.runningSince?.toISOString() ?? null,
              lastFinishedAt: status.lastFinishedAt?.toISOString() ?? null,
              lastDurationMs: status.lastDurationMs,
              lastResult: status.lastResult,
              lastMessage: status.lastMessage,
            }
          : null,
      };
    }),
  );

  rows.sort((a, b) => a.priority - b.priority);
  const labels = Object.fromEntries(rows.map((row) => [row.id, row.label]));
  const runningSince =
    rows
      .map((row) => row.status?.runningSince ?? null)
      .filter((value): value is string => value !== null)
      .sort()[0] ?? null;
  const enabledCount = rows.filter((row) => row.enabled && row.connected).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every number supplier Xencodes can buy from. Each server is priced its own way (Server I
            by the platform price rules, Server II at 3.5&times; its cost); the cheapest server for a
            service and country is asked first, and Smart Pickup (below) orders servers at the same
            price. A server that is down or out of stock for a pair is skipped in favour of the
            next, never at a higher price without the customer confirming it.{" "}
            {enabledCount > 0
              ? `${enabledCount} provider${enabledCount === 1 ? "" : "s"} live right now.`
              : "None are live right now."}
          </p>
        </div>
        <SyncAllButton labels={labels} runningSince={runningSince} />
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <ProviderCard key={row.id} {...row} />
        ))}
      </div>

      <SmartPickupCard
        settings={smartPickup}
        providers={PROVIDER_DEFINITIONS.map((definition) => ({ id: definition.id, label: displayLabel(definition.id) }))}
        performance={performance.map((row) => ({ ...row, label: displayLabel(row.providerId) }))}
        ambiguous={ambiguous.map((row) => ({
          id: row.id,
          providerLabel: displayLabel(row.providerId),
          serviceSlug: row.serviceSlug,
          countrySlug: row.countrySlug,
          detail: row.detail,
          createdAt: row.createdAt.toISOString(),
        }))}
      />

      {rows
        .filter((row) => row.supportsPriceDiagnostic)
        .map((row) => (
          <PriceTierDiagnosticCard key={`diagnostic-${row.id}`} providerId={row.id} />
        ))}

      <FlaggedFailuresCard
        items={flagged.map((row) => ({
          id: row.id,
          providerId: row.providerId,
          serviceSlug: row.serviceSlug,
          countrySlug: row.countrySlug,
          consecutiveFails: row.consecutiveFails,
          totalFails: row.totalFails,
          lastFailureReason: row.lastFailureReason,
          lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
        }))}
      />

      <QualityReportCard
        windowDays={quality.windowDays}
        minSampleSize={quality.minSampleSize}
        overall={quality.overall}
        services={quality.services.map((row) => ({
          slug: row.serviceSlug,
          label: row.serviceName,
          successRatePercent: row.successRatePercent,
          tier: row.tier,
          sampleSize: row.sampleSize,
        }))}
        countries={quality.countries.map((row) => ({
          slug: row.countrySlug,
          label: row.countryName,
          successRatePercent: row.successRatePercent,
          tier: row.tier,
          sampleSize: row.sampleSize,
        }))}
      />

      <SellerDeliveryCard rows={sellerDelivery} />

      <PoolQualityReportCard rows={poolQuality} />
    </div>
  );
}
