import {
  readSettings,
  readNumber,
  SETTING_KEYS,
  DEFAULT_LOW_BALANCE_THRESHOLD_NGN_KOBO,
  DEFAULT_LOW_BALANCE_THRESHOLD_USD_CENTS,
} from "@/lib/settings";
import { convertMinor } from "@/lib/display-currency";
import { getDisplayRates } from "@/lib/exchange-rates";

/** The admin-configured low-balance threshold, in the given currency's own
 *  minor unit. NGN and USD have their own settings; a wallet held in any
 *  other currency uses the Naira threshold converted at today's rate. */
export async function getLowBalanceThreshold(currency: string): Promise<number> {
  const settings = await readSettings();
  if (currency !== "USD" && currency !== "NGN") {
    const ngn = readNumber(settings, SETTING_KEYS.lowBalanceThresholdNgnKobo, DEFAULT_LOW_BALANCE_THRESHOLD_NGN_KOBO);
    return convertMinor(ngn, "NGN", currency, await getDisplayRates()) ?? 0;
  }
  if (currency === "USD") {
    return readNumber(
      settings,
      SETTING_KEYS.lowBalanceThresholdUsdCents,
      DEFAULT_LOW_BALANCE_THRESHOLD_USD_CENTS,
    );
  }
  return readNumber(
    settings,
    SETTING_KEYS.lowBalanceThresholdNgnKobo,
    DEFAULT_LOW_BALANCE_THRESHOLD_NGN_KOBO,
  );
}

/**
 * Whether the dashboard should show the low-balance warning right now.
 *
 * Not shown at all above the threshold. Below it, shown unless it was
 * already dismissed at this exact balance — dismissal is remembered by the
 * balance it happened at (User.lowBalanceDismissedAtKobo), not as a
 * permanent flag, so it reappears the moment that balance actually changes:
 * spend more (it drops further) and the new, lower figure no longer matches
 * what was dismissed; top up and cross back above the threshold and the
 * next dip below it is a fresh warning, not a stale one still marked seen.
 */
export function shouldShowLowBalanceWarning(
  balanceKobo: number,
  thresholdKobo: number,
  dismissedAtKobo: number | null,
): boolean {
  if (balanceKobo > thresholdKobo) return false;
  if (dismissedAtKobo === null) return true;
  return balanceKobo !== dismissedAtKobo;
}
