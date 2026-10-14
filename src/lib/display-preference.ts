import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildDisplayContext,
  canDisplay,
  resolveDisplayCurrency,
  type DisplayContext,
} from "@/lib/display-currency";
import { alignWalletCurrency, walletCurrencyOf } from "@/lib/wallet-currency";
import { normalizeCountryCode } from "@/lib/currency-meta";
import { isKnownCountry } from "@/lib/countries";
import { getDisplayRates } from "@/lib/exchange-rates";

/** The guest (and signed-in fallback) preference. A signed-in customer's own
 *  choice is stored on their account instead and wins over this. */
export const DISPLAY_CURRENCY_COOKIE = "xen_currency";

/**
 * Everything the layouts need to show prices in the right currency for this
 * request: the saved preference (account first, then cookie), the saved
 * account country, the country detected from the request as a last-resort
 * fallback, and the current exchange rates.
 *
 * Read once per request (React cache), so the header selector, the page and
 * the client components all agree.
 */
export const getDisplayContext = cache(async (): Promise<DisplayContext> => {
  const [session, jar, requestHeaders] = await Promise.all([auth(), cookies(), headers()]);

  let preference: string | null = jar.get(DISPLAY_CURRENCY_COOKIE)?.value ?? null;
  let savedCountry: string | null = null;

  const userId = session?.user?.id;
  const user = userId
    ? await prisma.user
        .findUnique({
          where: { id: userId },
          select: { id: true, email: true, role: true, displayCurrency: true, country: true, currency: true },
        })
        .catch(() => null)
    : null;
  if (user) {
    preference = user.displayCurrency ?? preference;
    savedCountry = user.country;
  }

  const rates = await getDisplayRates();
  const choice = { preference, savedCountry, detectedCountry: requestHeaders.get("x-vercel-ip-country") };
  const context = buildDisplayContext(choice, rates);
  if (!user || user.role === "ADMIN") return context;

  // A signed-in customer sees everything in the currency their wallet is
  // held in, so their balance is exactly what it says. The wallet follows the
  // currency they chose, or their country's: an empty wallet just switches,
  // and money already in it is moved once at today's rate.
  //
  // A country only detected from the request is saved to the account the
  // first time it is used, so the wallet is never moved back and forth by
  // where later requests come from (travel, a VPN). The customer can change
  // it in settings. With no country at all, nothing is moved.
  const wanted = resolveDisplayCurrency(choice);
  let movable = wanted.source === "preference" || wanted.source === "saved_country";
  if (wanted.source === "detected_country" && !user.country) {
    const detected = normalizeCountryCode(choice.detectedCountry);
    if (detected && isKnownCountry(detected)) {
      const saved = await prisma.user
        .updateMany({ where: { id: user.id, country: null }, data: { country: detected } })
        .catch((error) => {
          console.error(`[currency] could not save detected country for ${user.id}:`, error);
          return null;
        });
      movable = saved?.count === 1;
    }
  }
  let walletCurrency = walletCurrencyOf(user.currency);
  if (movable && wanted.code !== walletCurrency && canDisplay(wanted.code, rates)) {
    const aligned = await alignWalletCurrency(user, wanted.code, { convertBalance: true, rates }).catch((error) => {
      console.error(`[currency] could not align wallet currency for ${user.id}:`, error);
      return null;
    });
    if (aligned) walletCurrency = aligned.currency;
  }
  return { ...context, display: walletCurrency };
});
