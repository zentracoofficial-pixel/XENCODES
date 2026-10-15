"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { readCurrencyConfig } from "@/lib/currency-config";
import { resolveFundingFee } from "@/lib/fee-policy";
import { validateTopUpAmount, fundingErrorCopy } from "@/lib/funding-limits";
import { createPendingUsdtTopUp, settleFailedTopUp } from "@/lib/funding";
import { createUsdtInvoice, isCryptomusConfigured, CryptomusError } from "@/lib/cryptomus";
import { alignWalletCurrency, WALLET_CONVERSIONS_PER_DAY } from "@/lib/wallet-currency";
import { convertMoneyMinor } from "@/lib/display-currency";
import { getDisplayRates } from "@/lib/exchange-rates";
import { DISPLAY_CURRENCY_COOKIE } from "@/lib/display-preference";

/**
 * USDT funding through Cryptomus. The customer names an amount in US dollars,
 * pays the same amount in USDT on Cryptomus's page, and their wallet is
 * credited that many dollars once Cryptomus confirms the payment (see
 * verifyAndSettleUsdtTopUp() in src/lib/funding.ts). Paying with USDT puts
 * the account in US dollars: balance, prices and purchases.
 */

const UNAVAILABLE = "USDT funding is not available right now. Please try again later.";

async function usdLimits() {
  const usd = (await readCurrencyConfig()).find((c) => c.code === "USD")!;
  return { min: usd.minTopUpMinor, max: usd.maxTopUpMinor };
}

export interface UsdtPreview {
  error?: string;
  feeCents?: number;
  totalCents?: number;
  /** Shown when starting will move an existing balance to US dollars. */
  switchNote?: string;
}

/** The fee, the total to pay and what happens to the balance, for the summary
 *  before the customer continues. Changes nothing. */
export async function previewUsdtTopUpAction(amountCents: number): Promise<UsdtPreview> {
  const user = await getActiveUser();
  if (!user) return { error: fundingErrorCopy("not_authenticated", "USD", 0, 0) };
  if (!isCryptomusConfigured()) return { error: UNAVAILABLE };
  const { min, max } = await usdLimits();
  const invalid = validateTopUpAmount(amountCents, min, max);
  if (invalid) return { error: fundingErrorCopy(invalid, "USD", min, max) };
  const fee = await resolveFundingFee("USDT", amountCents);
  if (fee.status === "blocked") return { error: UNAVAILABLE };

  let switchNote: string | undefined;
  if (user.currency !== "USD") {
    const wallet = await prisma.user.findUnique({ where: { id: user.id }, select: { walletBalanceKobo: true, currency: true } });
    if (wallet && wallet.walletBalanceKobo > 0) {
      const usd = convertMoneyMinor(wallet.walletBalanceKobo, wallet.currency, "USD", await getDisplayRates());
      switchNote =
        usd === null
          ? `Your ${formatMoney(wallet.walletBalanceKobo, wallet.currency)} balance moves to US dollars at today's rate.`
          : `Your ${formatMoney(wallet.walletBalanceKobo, wallet.currency)} balance becomes ${formatMoney(usd, "USD")} at today's rate.`;
    } else {
      switchNote = "Your account switches to US dollars.";
    }
  }
  return { feeCents: fee.feeMinor, totalCents: amountCents + fee.feeMinor, switchNote };
}

export interface UsdtStartResult {
  error?: string;
  checkoutUrl?: string;
}

export async function startUsdtTopUpAction(amountCents: number): Promise<UsdtStartResult> {
  const user = await getActiveUser();
  if (!user) return { error: fundingErrorCopy("not_authenticated", "USD", 0, 0) };
  if (!isCryptomusConfigured()) return { error: UNAVAILABLE };
  const { min, max } = await usdLimits();
  const invalid = validateTopUpAmount(amountCents, min, max);
  if (invalid) return { error: fundingErrorCopy(invalid, "USD", min, max) };
  const fee = await resolveFundingFee("USDT", amountCents);
  if (fee.status === "blocked") return { error: UNAVAILABLE };

  // USDT funding means a US dollar account: move the wallet (and any balance,
  // at today's rate) to USD before the payment, so the credit lands in it.
  const moved = await alignWalletCurrency(user, "USD", { convertBalance: true });
  if (!moved.ok) {
    return {
      error:
        moved.error === "too_many_changes"
          ? `Your balance can change currency up to ${WALLET_CONVERSIONS_PER_DAY} times a day. Try again tomorrow.`
          : moved.error === "no_rate"
            ? "We could not move your balance to US dollars right now. Please try again shortly."
            : "Your balance just changed. Please try again.",
    };
  }
  await prisma.user.updateMany({ where: { id: user.id }, data: { displayCurrency: "USD" } });
  (await cookies()).set(DISPLAY_CURRENCY_COOKIE, "USD", {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const pending = await createPendingUsdtTopUp(user.id, amountCents, fee.feeMinor);
  const reference = pending.providerReference!;
  try {
    const invoice = await createUsdtInvoice({ reference, amountCents: amountCents + fee.feeMinor });
    revalidatePath("/dashboard/wallet");
    return { checkoutUrl: invoice.url };
  } catch (error) {
    console.error(`[wallet] Cryptomus invoice failed to start for ${reference}:`, error);
    await settleFailedTopUp(
      reference,
      "CANCELLED",
      error instanceof CryptomusError ? error.message : "Failed to start checkout.",
    );
    revalidatePath("/dashboard/wallet");
    return { error: "We could not start the USDT payment. Nothing was charged; please try again." };
  }
}
