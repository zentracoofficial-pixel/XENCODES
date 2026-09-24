import { readSettings, writeSetting, SETTING_KEYS } from "@/lib/settings";
import { PROVIDER_DEFINITIONS } from "./registry";

/**
 * Which registered providers are switched on, and in what order to try
 * them. Non-secret: an entry is just an id, a boolean, and an integer. No
 * credential is ever stored here, or anywhere in the database — see
 * registry.ts's ProviderDefinition.create(), which reads a key only from
 * process.env.
 */
export interface ProviderConfigEntry {
  id: string;
  enabled: boolean;
  /** Lower runs first when more than one enabled provider can serve the
   *  same service/country pair. Not required to be unique or contiguous. */
  priority: number;
}

/**
 * Fills in every provider the code currently knows about (registry.ts),
 * defaulting one with no stored entry to disabled at the back of the
 * priority order. This is what lets a newly-added provider definition show
 * up on /admin/providers as an off toggle the moment it ships, with no
 * database write required first.
 */
function withEveryDefinition(stored: ProviderConfigEntry[]): ProviderConfigEntry[] {
  const byId = new Map(stored.map((entry) => [entry.id, entry]));
  return PROVIDER_DEFINITIONS.map((definition, index) => {
    const existing = byId.get(definition.id);
    return existing
      ? { id: definition.id, enabled: existing.enabled, priority: existing.priority ?? index }
      : { id: definition.id, enabled: false, priority: index };
  });
}

/**
 * Reads the enable/priority config for every registered provider.
 *
 * Falls back once to the pre-multi-provider settings (provider_id,
 * provider_enabled) when providerConfig has never been written, so an
 * existing production deployment's live GrizzlySMS connection keeps working
 * unchanged the moment this ships — no manual admin step, no re-entering a
 * choice that was already made. The first save from /admin/providers writes
 * providerConfig and that fallback is never consulted again.
 */
export async function readProviderConfig(): Promise<ProviderConfigEntry[]> {
  const settings = await readSettings();
  const raw = settings[SETTING_KEYS.providerConfig];

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const entries = parsed.flatMap((row) => {
          if (
            typeof row !== "object" ||
            row === null ||
            typeof (row as Record<string, unknown>).id !== "string"
          ) {
            return [];
          }
          const record = row as Record<string, unknown>;
          return [
            {
              id: record.id as string,
              enabled: record.enabled === true,
              priority: typeof record.priority === "number" ? record.priority : 0,
            },
          ];
        });
        return withEveryDefinition(entries);
      }
    } catch {
      console.error(
        `[provider] "${SETTING_KEYS.providerConfig}" is not valid JSON; ignoring stored value.`,
      );
    }
  }

  const legacyId = settings[SETTING_KEYS.providerId]?.trim();
  const legacyEnabled = settings[SETTING_KEYS.providerEnabled] === "true";
  if (legacyId) {
    return withEveryDefinition([{ id: legacyId, enabled: legacyEnabled, priority: 0 }]);
  }

  return withEveryDefinition([]);
}

export async function writeProviderConfig(entries: ProviderConfigEntry[]): Promise<void> {
  await writeSetting(SETTING_KEYS.providerConfig, JSON.stringify(entries));
}

/** Enables or disables one provider, leaving every other entry untouched. */
export async function setProviderEnabled(id: string, enabled: boolean): Promise<void> {
  const config = await readProviderConfig();
  await writeProviderConfig(
    config.map((entry) => (entry.id === id ? { ...entry, enabled } : entry)),
  );
}

/** Sets one provider's priority, leaving every other entry untouched. */
export async function setProviderPriority(id: string, priority: number): Promise<void> {
  const config = await readProviderConfig();
  await writeProviderConfig(
    config.map((entry) => (entry.id === id ? { ...entry, priority } : entry)),
  );
}
