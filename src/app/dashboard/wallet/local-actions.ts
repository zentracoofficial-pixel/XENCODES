"use server";

import { revalidatePath } from "next/cache";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createPendingLocalTopUp, settleFailedTopUp } from "@/lib/funding";
import { quoteLocalFunding } from "@/lib/funding-config";
import {
  localFundingErrorCopy,
  isFundingCurrencyCode,
  normalizeCountry,
  pickerCountries,
  type FundingCurrencyCode,
  type FundingQuote,
} from "@/lib/funding-currencies";
import { initializeKorapayCharge, KorapayError } from "@/lib/korapay";

/**
 * Local-currency funding: pay in Cedi, Shilling, CFA or Pound, credited to
 * the Naira wallet. See src/lib/funding-currencies.ts for the rules and
 * src/lib/funding.ts for the one place a balance moves.
 *
 * Both actions re-derive everything from the server: the customer's saved
 * country, the currency's admin settings and rate, the limits and the fee.
 * The browser sends only a currency, an amount and (for a customer with no
 * saved country) the country they picked, and none of it is trusted.
 */

export interface LocalQuoteSummary {
  currency: FundingCurrencyCode;
  amountMinor: number;
  feeMinor: number;
  totalMinor: number;
  ngnPerUnit: number;
  creditKobo: number;
}

function summarize(quote: FundingQuote): LocalQuoteSummary {
  return {
    currency: quote.currency,
    amountMinor: quote.amountMinor,
    feeMinor: quote.feeMinor,
    totalMinor: quote.totalMinor,
    ngnPerUnit: quote.ngnPerUnit,
    creditKobo: quote.creditKobo,
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
  claimedCountry: unknown,
): Promise<{ error: string } | { quote: FundingQuote; userId: string; email: string; name: string | null }> {
  const user = await getActiveUser();
  if (!user) return { error: "Log in to add funds." };
  const code = isFundingCurrencyCode(currency) ? currency : null;
  if (user.currency !== "NGN") {
    return { error: localFundingErrorCopy("wallet_currency", code) };
  }

  const result = await quoteLocalFunding({
    savedCountry: user.country,
    claimedCountry: typeof claimedCountry === "string" ? claimedCountry : null,
    currency,
    amountMinor: typeof amountMinor === "number" ? amountMinor : Number.NaN,
  });
  if (!result.ok) return { error: localFundingErrorCopy(result.error, code, result.limits) };
  return { quote: result.quote, userId: user.id, email: user.email, name: user.name };
}

/** What a payment would cost and credit, for the summary shown before the
 *  customer confirms. Creates nothing and talks to no one. */
export async function previewLocalFundingAction(
  currency: string,
  amountMinor: number,
  claimedCountry?: string | null,
): Promise<LocalQuoteResult> {
  const checked = await evaluate(currency, amountMinor, claimedCountry);
  if ("error" in checked) return { error: checked.error };
  return { quote: summarize(checked.quote) };
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
  claimedCountry?: string | null,
): Promise<LocalStartResult> {
  const checked = await evaluate(currency, amountMinor, claimedCountry);
  if ("error" in checked) return { error: checked.error };

  const pending = await createPendingLocalTopUp(checked.userId, checked.quote);
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
    return { reference, checkoutUrl, quote: summarize(checked.quote) };
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
 * Saves the customer's country when we do not have one yet. Set once: it
 * decides which local currency is offered, so it is not a toggle a customer
 * can flip around; support can correct a wrong one.
 */
export async function saveCountryAction(country: string): Promise<{ error?: string; country?: string }> {
  const user = await getActiveUser();
  if (!user) return { error: "Log in to continue." };
  const iso2 = normalizeCountry(country);
  if (!iso2 || !pickerCountries().some((c) => c.iso2 === iso2)) {
    return { error: "Choose a country from the list." };
  }
  if (user.country) return { country: user.country };

  await prisma.user.updateMany({ where: { id: user.id, country: null }, data: { country: iso2 } });
  revalidatePath("/dashboard/wallet");
  return { country: iso2 };
}
