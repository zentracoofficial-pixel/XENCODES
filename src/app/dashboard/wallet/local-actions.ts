"use server";

import { revalidatePath } from "next/cache";
import { getActiveUser } from "@/lib/session";
import { createPendingLocalTopUp, settleFailedTopUp } from "@/lib/funding";
import { quoteLocalFunding } from "@/lib/funding-config";
import {
  localFundingErrorCopy,
  isFundingCurrencyCode,
  type FundingCurrencyCode,
  type FundingQuote,
} from "@/lib/funding-currencies";
import { initializeKorapayCharge, KorapayError } from "@/lib/korapay";
import { changeOwnCountry } from "@/lib/user-country";
import { convertMinor } from "@/lib/display-currency";
import { getDisplayRates } from "@/lib/exchange-rates";
import { walletCurrencyOf } from "@/lib/wallet-currency";

/**
 * Local-currency funding: pay in Cedi, Shilling, CFA or Pound, credited to
 * the wallet in the wallet's own currency (exactly the amount paid when the
 * wallet is in that currency). See src/lib/funding-currencies.ts for the rules and
 * src/lib/funding.ts for the one place a balance moves.
 *
 * Both actions re-derive everything from the server: the currency's admin
 * switch and rate, the limits and the approved fee. The browser sends only a
 * currency and an amount. Any customer may pay in any currency an admin has
 * switched on (the one they chose in the currency selector is offered first);
 * the country is not a restriction.
 */

export interface LocalQuoteSummary {
  currency: FundingCurrencyCode;
  amountMinor: number;
  feeMinor: number;
  totalMinor: number;
  ngnPerUnit: number;
  creditKobo: number;
  /** Exactly what the wallet is credited, in the wallet's own currency. */
  creditMinor: number;
  creditCurrency: string;
}

/** What a local-currency payment adds to a wallet held in `walletCurrency`:
 *  the amount paid (before the fee) when the wallet is in the same currency,
 *  otherwise the quoted Naira credit converted at today's rate. */
async function walletCredit(
  walletCurrency: string,
  quote: FundingQuote,
): Promise<{ amountMinor: number; currency: string } | null> {
  const wallet = walletCurrencyOf(walletCurrency);
  if (wallet === quote.currency) return { amountMinor: quote.amountMinor, currency: wallet };
  if (wallet === "NGN") return { amountMinor: quote.creditKobo, currency: wallet };
  const converted = convertMinor(quote.creditKobo, "NGN", wallet, await getDisplayRates());
  return converted !== null && converted > 0 ? { amountMinor: converted, currency: wallet } : null;
}

function summarize(quote: FundingQuote, credit: { amountMinor: number; currency: string }): LocalQuoteSummary {
  return {
    currency: quote.currency,
    amountMinor: quote.amountMinor,
    feeMinor: quote.feeMinor,
    totalMinor: quote.totalMinor,
    ngnPerUnit: quote.ngnPerUnit,
    creditKobo: quote.creditKobo,
    creditMinor: credit.amountMinor,
    creditCurrency: credit.currency,
  };
}

export interface LocalQuoteResult {
  error?: string;
  quote?: LocalQuoteSummary;
}

export interface LocalStartResult extends LocalQuoteResult {
  reference?: string;
  checkoutUrl?: string;
}

async function evaluate(
  currency: unknown,
  amountMinor: unknown,
): Promise<
  | { error: string }
  | {
      quote: FundingQuote;
      credit: { amountMinor: number; currency: string };
      userId: string;
      email: string;
      name: string | null;
    }
> {
  const user = await getActiveUser();
  if (!user) return { error: "Log in to add funds." };
  const code = isFundingCurrencyCode(currency) ? currency : null;

  const result = await quoteLocalFunding({
    currency,
    amountMinor: typeof amountMinor === "number" ? amountMinor : Number.NaN,
  });
  if (!result.ok) return { error: localFundingErrorCopy(result.error, code, result.limits) };
  const credit = await walletCredit(user.currency, result.quote);
  if (!credit) return { error: localFundingErrorCopy("rate_unavailable", code) };
  return { quote: result.quote, credit, userId: user.id, email: user.email, name: user.name };
}

/** What a payment would cost and credit, for the summary shown before the
 *  customer confirms. Creates nothing and talks to no one. */
export async function previewLocalFundingAction(
  currency: string,
  amountMinor: number,
): Promise<LocalQuoteResult> {
  const checked = await evaluate(currency, amountMinor);
  if ("error" in checked) return { error: checked.error };
  return { quote: summarize(checked.quote, checked.credit) };
}

/**
 * Records the pending attempt and opens KoraPay's checkout in the local
 * currency. Credits nothing: the wallet moves only after the payment is
 * verified server side (reconcileTopUp, from the webhook or the customer's
 * return), exactly like a Naira top up.
 */
export async function startLocalTopUpAction(
  currency: string,
  amountMinor: number,
): Promise<LocalStartResult> {
  const checked = await evaluate(currency, amountMinor);
  if ("error" in checked) return { error: checked.error };

  const pending = await createPendingLocalTopUp(checked.userId, checked.quote, checked.credit);
  const reference = pending.providerReference;
  if (!reference) return { error: "We could not start checkout. Nothing was charged; please try again." };

  try {
    const { checkoutUrl } = await initializeKorapayCharge({
      reference,
      amountKobo: checked.quote.totalMinor,
      currency: checked.quote.currency,
      email: checked.email,
      name: checked.name,
    });
    revalidatePath("/dashboard/wallet");
    return { reference, checkoutUrl, quote: summarize(checked.quote, checked.credit) };
  } catch (error) {
    console.error(`[wallet] KoraPay local checkout failed to start for ${reference}:`, error);
    await settleFailedTopUp(
      reference,
      "CANCELLED",
      error instanceof KorapayError ? error.message : "Failed to start checkout.",
    );
    revalidatePath("/dashboard/wallet");
    return {
      error:
        "We could not start checkout for this currency. Nothing was charged; please try again or use another option.",
    };
  }
}

/**
 * Saves or changes the customer's country (see changeOwnCountry() for the
 * rules: any known country, a daily limit, every change audit-logged).
 */
export async function saveCountryAction(country: string): Promise<{ error?: string; country?: string }> {
  const user = await getActiveUser();
  if (!user) return { error: "Log in to continue." };
  const result = await changeOwnCountry(user, country);
  if (!result.ok) {
    return {
      error:
        result.error === "too_many_changes"
          ? "You have changed your country several times today. Try again tomorrow, or contact support."
          : "Choose a country from the list.",
    };
  }
  if (result.changed) revalidatePath("/", "layout");
  return { country: result.country };
}
