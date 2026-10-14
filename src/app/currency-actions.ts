"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canDisplay } from "@/lib/display-currency";
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
 * Display only. This touches no balance, no ledger row, no country and no
 * payment permission: what a customer may pay with is decided on the server
 * from their saved country and the admin's funding settings, never from this.
 * Signed in, the choice lives on the account (and follows them across
 * devices); everyone also gets a cookie so it applies before and after
 * signing in.
 */
export async function setDisplayCurrencyAction(code: string | null): Promise<DisplayCurrencyResult> {
  const jar = await cookies();

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

  const session = await auth();
  if (session?.user?.id) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { displayCurrency: code },
    });
  }

  revalidatePath("/", "layout");
  return {};
}
