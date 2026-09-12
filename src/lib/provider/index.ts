import {
  readSettings,
  readNumber,
  SETTING_KEYS,
  DEFAULT_USD_TO_NGN_RATE,
} from "@/lib/settings";
import { developmentProvider } from "./development";
import { HttpProvider } from "./http";
import { SmsPoolProvider } from "./smspool";
import type { NumberProvider } from "./types";

export * from "./types";
export { developmentProvider } from "./development";
export { SmsPoolProvider } from "./smspool";

/**
 * Resolves the provider the site should be using right now.
 *
 * The master switch is the "Connection enabled" toggle in Settings. Once
 * that is on:
 *
 * - If SMSPOOL_API_KEY is set as an environment variable, SMSPool is used.
 *   The key comes from the environment rather than the database, so a real
 *   production secret is never stored there or visible in the admin panel.
 * - Otherwise, an admin-entered name, base URL and API key in Settings
 *   configure the generic HTTP adapter for a different provider.
 * - With neither configured, the development adapter runs, clearly labelled
 *   everywhere it is visible.
 */
export async function getProvider(): Promise<NumberProvider> {
  const settings = await readSettings();
  const enabled = settings[SETTING_KEYS.providerEnabled] === "true";

  if (!enabled) return developmentProvider;

  const smsPoolKey = process.env.SMSPOOL_API_KEY;
  if (smsPoolKey) {
    const usdToNgnRate = readNumber(
      settings,
      SETTING_KEYS.usdToNgnRate,
      DEFAULT_USD_TO_NGN_RATE,
    );
    return new SmsPoolProvider({ apiKey: smsPoolKey, usdToNgnRate });
  }

  const baseUrl = settings[SETTING_KEYS.providerBaseUrl];
  const apiKey = settings[SETTING_KEYS.providerApiKey];
  const label = settings[SETTING_KEYS.providerName];

  if (!baseUrl || !apiKey) return developmentProvider;

  return new HttpProvider({ label: label || "Provider", baseUrl, apiKey });
}
