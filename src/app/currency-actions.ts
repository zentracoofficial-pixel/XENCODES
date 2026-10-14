"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canDisplay, resolveDisplayCurrency } from "@/lib/display-currency";
import { alignWalletCurrency, WALLET_CONVERSIONS_PER_DAY } from "@/lib/wallet-currency";
import { getDisplayRates } from "@/lib/exchange-rates";
import { isDisplayCurrencyCode } from "@/lib/currency-meta";
import { DISPLAY_CURRENCY_COOKIE } from "@/lib/display-preference";

export interface DisplayCurrencyResult {
  error?: string;
}

/**
 * Saves how the customer wants prices shown, or clears it (null) to go back
 * to the default for their country.
 *
 * Signed in, this is also the currency the wallet is held in, so the balance
 * is moved to it at today's rate (see alignWalletCurrency()); it changes no
 * country and no payment permission. The choice lives on the account (and
 * follows them across devices); everyone also gets a cookie so it applies
 * before and after signing in.
 */
export async function setDisplayCurrencyAction(code: string | null): Promise<DisplayCurrencyResult> {
  const jar = await cookies();
  const session = await auth();

  // A signed-in customer's wallet is held in the currency they see, so
  // choosing a currency moves the balance to it (at today's rate) first. If
  // that cannot happen right now, nothing is changed.
  if (session?.user?.id && (code === null || isDisplayCurrencyCode(code))) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, role: true, country: true },
    });
    if (user && user.role !== "ADMIN") {
      const rates = await getDisplayRates();
      const target =
        code ??
        resolveDisplayCurrency({
          preference: null,
          savedCountry: user.country,
          detectedCountry: (await headers()).get("x-vercel-ip-country"),
        }).code;
      if (!canDisplay(target, rates)) {
        return { error: `${target} is unavailable right now because no exchange rate is available. Try again later.` };
      }
      const moved = await alignWalletCurrency(user, target, { convertBalance: true, rates });
      if (!moved.ok) {
        return {
          error:
            moved.error === "too_many_changes"
              ? `Your balance can change currency up to ${WALLET_CONVERSIONS_PER_DAY} times a day. Try again tomorrow.`
              : moved.error === "no_rate"
                ? `${target} is unavailable right now because no exchange rate is available. Try again later.`
                : "Your balance just changed. Please try again.",
        };
      }
    }
  }

  if (code === null) {
    jar.delete(DISPLAY_CURRENCY_COOKIE);
  } else {
    if (!isDisplayCurrencyCode(code)) return { error: "That currency is not available." };
    const rates = await getDisplayRates();
    if (!canDisplay(code, rates)) {
      return { error: `${code} prices are unavailable right now because no exchange rate is available. Try again later.` };
    }
    jar.set(DISPLAY_CURRENCY_COOKIE, code, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  if (session?.user?.id) {
    await prisma.user.updateMany({
      where: { id: session.user.id },
      data: { displayCurrency: code },
    });
  }

  revalidatePath("/", "layout");
  return {};
}
