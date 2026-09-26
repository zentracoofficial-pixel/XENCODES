import { prisma } from "@/lib/prisma";
import { getEnabledProviders } from "@/lib/provider";
import { getAllProviderSyncStatuses } from "@/lib/provider-sync";
import { isKorapayConfigured } from "@/lib/korapay";
import { isEmailConfigured } from "@/lib/email";

/**
 * A compact health rollup for the admin dashboard, reading only signals
 * that already exist elsewhere (provider connection, ProviderSyncStatus,
 * KoraPay/Resend configuration) plus one direct database ping. Never a
 * secret in sight: every value here is a status word or a timestamp, never
 * an API key.
 */

export type HealthState = "ok" | "warning" | "error";

export interface HealthSignal {
  label: string;
  state: HealthState;
  detail: string;
  lastEventAt?: Date | null;
}

export async function getSystemHealth(): Promise<HealthSignal[]> {
  const signals: HealthSignal[] = [];

  // Database: a real round trip, not just "this page loaded" (which would
  // already be false if the connection were down, but a dedicated ping is
  // what actually reports a slow/degraded connection distinctly from "down").
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - start;
    signals.push({
      label: "Database",
      state: ms > 1000 ? "warning" : "ok",
      detail: ms > 1000 ? `Responding slowly (${ms}ms)` : `Connected (${ms}ms)`,
    });
  } catch (error) {
    signals.push({
      label: "Database",
      state: "error",
      detail: error instanceof Error ? error.message : "Unreachable",
    });
  }

  // Number providers: connected + how fresh their catalog sync is.
  const enabled = await getEnabledProviders();
  const syncStatuses = await getAllProviderSyncStatuses();
  if (enabled.length === 0) {
    signals.push({ label: "Number providers", state: "error", detail: "None enabled" });
  } else {
    for (const { id, label, provider } of enabled) {
      const status = syncStatuses.get(id);
      const connected = await provider.testConnection?.().catch(() => false) ?? true;
      signals.push({
        label,
        state: connected ? "ok" : "error",
        detail: connected ? "Connected" : "Not responding",
      });
      signals.push({
        label: `${label} catalog sync`,
        state: status?.isFresh ? "ok" : status?.lastFailureError ? "error" : "warning",
        detail: status?.lastSuccessAt
          ? status.isFresh
            ? `Synced ${status.servicesSynced ?? 0} services, ${status.countriesSynced ?? 0} countries`
            : "Last sync is stale"
          : status?.lastFailureError
            ? `Failing: ${status.lastFailureError}`
            : "Never synced",
        lastEventAt: status?.lastSuccessAt ?? null,
      });
    }
  }

  // Payments.
  signals.push({
    label: "KoraPay (NGN funding)",
    state: isKorapayConfigured() ? "ok" : "warning",
    detail: isKorapayConfigured() ? "Connected" : "KORAPAY_SECRET_KEY not set",
  });

  // Email.
  signals.push({
    label: "Email (Resend)",
    state: isEmailConfigured() ? "ok" : "warning",
    detail: isEmailConfigured() ? "Connected" : "RESEND_API_KEY not set",
  });

  return signals;
}
