"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { recordAudit } from "@/lib/audit";
import {
  getProviderDefinition,
  resolveProvider,
  setProviderEnabled,
  setProviderPriority,
} from "@/lib/provider";
import { runProviderSync, type ProviderSyncResult } from "@/lib/provider-sync";

function refresh() {
  revalidatePath("/admin/providers");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/services");
  revalidatePath("/admin");
  revalidatePath("/buy");
  revalidatePath("/dashboard/buy");
}

export interface ProviderActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Switches one provider on or off. Turning one on does not by itself sync
 * its catalog or start selling from it if its credentials are missing;
 * getEnabledProviders() (src/lib/provider/index.ts) skips an enabled
 * provider it cannot actually connect to, logging why, rather than half
 * offering it.
 */
export async function toggleProviderAction(
  providerId: string,
  enabled: boolean,
): Promise<ProviderActionResult> {
  const admin = await requireAdmin();
  if (!getProviderDefinition(providerId)) {
    return { ok: false, error: "Unknown provider." };
  }

  await setProviderEnabled(providerId, enabled);
  await recordAudit({
    actor: admin,
    action: enabled ? "provider.enable" : "provider.disable",
    targetType: "provider",
    targetId: providerId,
    metadata: { providerId, enabled },
  });

  refresh();
  return { ok: true };
}

/** Lower runs, and is tried, first when more than one enabled provider can
 *  serve the same service/country pair. */
export async function updateProviderPriorityAction(
  providerId: string,
  priority: number,
): Promise<ProviderActionResult> {
  const admin = await requireAdmin();
  if (!getProviderDefinition(providerId)) {
    return { ok: false, error: "Unknown provider." };
  }
  if (!Number.isInteger(priority)) {
    return { ok: false, error: "Priority must be a whole number." };
  }

  await setProviderPriority(providerId, priority);
  await recordAudit({
    actor: admin,
    action: "provider.priority",
    targetType: "provider",
    targetId: providerId,
    metadata: { providerId, priority },
  });

  refresh();
  return { ok: true };
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * A real, safe request to the provider, so an admin can confirm credentials
 * actually work before (or after) switching a provider on. Never reserves a
 * number or spends anything: it uses the adapter's own testConnection() when
 * it has one, or otherwise falls back to a plain catalog read, which every
 * adapter must support and which has no side effect either.
 */
export async function testProviderConnectionAction(
  providerId: string,
): Promise<TestConnectionResult> {
  await requireAdmin();

  const resolution = await resolveProvider(providerId);
  if (!resolution.connected) {
    const reason =
      resolution.reason === "missing_credentials"
        ? "Its credentials are not set as an environment variable on this deployment."
        : resolution.reason === "no_adapter"
          ? "No integration is built for this provider."
          : "Not configured.";
    return { ok: false, message: reason };
  }

  const { provider } = resolution;
  if (provider.testConnection) {
    try {
      return await provider.testConnection();
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed.",
      };
    }
  }

  try {
    const services = await provider.getServices();
    return { ok: true, message: `Connected. ${services.length} services reported.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Connection test failed.",
    };
  }
}

/** Syncs one provider's catalog on demand, the same job the daily cron runs
 *  for it, without waiting for the schedule. */
export async function syncProviderAction(providerId: string): Promise<ProviderSyncResult> {
  const admin = await requireAdmin();

  const result = await runProviderSync(providerId);
  await recordAudit({
    actor: admin,
    action: "provider.sync_now",
    targetType: "provider",
    targetId: providerId,
    metadata: { providerId, ok: result.ok, error: result.error ?? null },
  });

  refresh();
  return result;
}

/** Syncs every enabled provider on demand, in one pass. */
export async function syncAllProvidersAction(): Promise<ProviderSyncResult> {
  const admin = await requireAdmin();

  const result = await runProviderSync();
  await recordAudit({
    actor: admin,
    action: "provider.sync_all",
    targetType: "provider",
    targetId: "all",
    metadata: { ok: result.ok, error: result.error ?? null },
  });

  refresh();
  return result;
}
