import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildDisplayContext, type DisplayContext } from "@/lib/display-currency";
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
  if (userId) {
    const user = await prisma.user
      .findUnique({ where: { id: userId }, select: { displayCurrency: true, country: true } })
      .catch(() => null);
    if (user) {
      preference = user.displayCurrency ?? preference;
      savedCountry = user.country;
    }
  }

  const rates = await getDisplayRates();
  return buildDisplayContext(
    {
      preference,
      savedCountry,
      detectedCountry: requestHeaders.get("x-vercel-ip-country"),
    },
    rates,
  );
});
