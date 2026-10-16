import {
  outcomeNeedsAnotherPass,
  summarize,
  type ProviderSyncOutcome,
  type ProviderSyncResult,
} from "@/lib/sync-result";

/** Most passes one click will run. A server read country by country needs
 *  about three or four; this is the ceiling, not the plan. */
export const MAX_SYNC_PASSES = 10;

/**
 * Runs a sync and keeps going while a server still has countries to read:
 * one click, as many passes as it takes (each pass is its own request, inside
 * the platform's time limit). After the first pass only the servers that need
 * more are asked again, so a server that already finished is not read twice.
 * Stops when everything is current, when a pass made no progress, when the
 * caller says stop, or at the pass ceiling, and returns the combined result.
 */
export async function runUntilCurrent(options: {
  first: () => Promise<ProviderSyncResult>;
  again: (providerId: string) => Promise<ProviderSyncResult>;
  /** Called after every pass with the combined result so far. */
  onUpdate?: (result: ProviderSyncResult, pass: number) => void;
  shouldStop?: () => boolean;
  maxPasses?: number;
}): Promise<ProviderSyncResult> {
  const maxPasses = options.maxPasses ?? MAX_SYNC_PASSES;
  let result = await options.first();
  options.onUpdate?.(result, 1);

  for (let pass = 2; pass <= maxPasses; pass++) {
    if (options.shouldStop?.()) break;
    const outcomes = result.providers ?? [];
    const pending = outcomes.filter(outcomeNeedsAnotherPass);
    if (pending.length === 0) break;

    const latest = new Map<string, ProviderSyncOutcome>();
    for (const outcome of pending) {
      if (options.shouldStop?.()) break;
      const next = await options.again(outcome.id);
      const updated = next.providers?.find((candidate) => candidate.id === outcome.id);
      if (updated) latest.set(outcome.id, updated);
    }
    if (latest.size === 0) break;
    result = summarize(outcomes.map((outcome) => latest.get(outcome.id) ?? outcome));
    options.onUpdate?.(result, pass);
  }
  return result;
}
