import { readSettings, SETTING_KEYS } from "@/lib/settings";
import { developmentProvider } from "./development";
import { HttpProvider } from "./http";
import type { NumberProvider } from "./types";

export * from "./types";
export { developmentProvider } from "./development";

/**
 * Resolves the provider the site should be using right now.
 *
 * An admin turns the live connection on in Settings once a name, base URL and
 * API key are saved. Until then every page runs on the development adapter,
 * which is clearly labelled everywhere it is visible.
 */
export async function getProvider(): Promise<NumberProvider> {
  const settings = await readSettings();

  const enabled = settings[SETTING_KEYS.providerEnabled] === "true";
  const baseUrl = settings[SETTING_KEYS.providerBaseUrl];
  const apiKey = settings[SETTING_KEYS.providerApiKey];
  const label = settings[SETTING_KEYS.providerName];

  if (!enabled || !baseUrl || !apiKey) {
    return developmentProvider;
  }

  return new HttpProvider({ label: label || "Provider", baseUrl, apiKey });
}
