import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { convertMinor, type DisplayRates } from "@/lib/display-currency";
import { getDisplayRates } from "@/lib/exchange-rates";
import { isDisplayCurrencyCode, type DisplayCurrencyCode } from "@/lib/currency-meta";

/**
 * Wallets are held in the customer's own currency (User.currency), so a
 * balance is exactly what it says and never moves when exchange rates do.
 *
 * Money only changes currency at three moments, each converted once at the
 * rate of that moment and then fixed: a number is bought (its Naira price is
 * converted and that exact amount leaves the wallet), a payment in another
 * currency is started (the credit is fixed then, see the wallet actions), and
 * a customer moves their balance to a different currency. Everything that
 * credits or debits a wallet goes through creditBalanceInTx() below, which
 * credits in whatever currency the wallet is in at that instant, so a refund
 * or a top-up can never land in the wrong unit even if the wallet's currency
 * changed after it was started.
 */

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** How many times a customer's balance may be moved to another currency in
 *  24 hours (each move is converted at the day's rate). */
export const WALLET_CONVERSIONS_PER_DAY = 5;
const CONVERSION_ACTION = "wallet.currency.convert";

/** Marks the two ledger rows of a balance moving to another currency. The
 *  customer sees only the incoming one (their balance in its new currency);
 *  the outgoing one keeps the ledger adding up in the old currency. */
export const CURRENCY_MOVE_PROVIDER = "currency_move";

/** A stored User.currency as a currency the site knows, defaulting to NGN
 *  for anything unexpected. */
export function walletCurrencyOf(code: string | null | undefined): DisplayCurrencyCode {
  return isDisplayCurrencyCode(code) ? code : "NGN";
}

/**
 * Credits (or, with a negative amount, debits) a wallet by an amount given in
 * `currency`, converting it into the wallet's own currency when they differ.
 * Guarded on the wallet's currency, so a concurrent currency move cannot slip
 * an amount in under the wrong unit. Returns what was actually applied.
 *
 * Throws "no_rate" when a conversion is needed and no rate exists, so the
 * caller's transaction rolls back instead of crediting a wrong amount.
 */
export async function creditBalanceInTx(
  tx: TransactionClient,
  userId: string,
  amountMinor: number,
  currency: string,
  rates?: DisplayRates,
): Promise<{ amountMinor: number; currency: string; converted: boolean }> {
  let knownRates = rates;
  for (let attempt = 0; attempt < 3; attempt++) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });
    let applied = amountMinor;
    if (user.currency !== currency) {
      knownRates ??= await getDisplayRates();
      const converted = convertMinor(amountMinor, currency, user.currency, knownRates);
      if (converted === null) throw new Error("no_rate");
      applied = converted;
    }
    const updated = await tx.user.updateMany({
      where: { id: userId, currency: user.currency },
      data: { walletBalanceKobo: { increment: applied } },
    });
    if (updated.count === 1) {
      return { amountMinor: applied, currency: user.currency, converted: user.currency !== currency };
    }
  }
  throw new Error("wallet_currency_changed");
}

export type AlignResult =
  | { ok: true; currency: DisplayCurrencyCode; changed: boolean }
  | { ok: false; currency: DisplayCurrencyCode; error: "too_many_changes" | "no_rate" | "busy" };

/**
 * Puts a customer's wallet in `target`.
 *
 * An empty wallet simply switches. A wallet with money in it is converted at
 * today's rate only when `convertBalance` is true (the customer chose the
 * currency, or saved a country), at most WALLET_CONVERSIONS_PER_DAY times a
 * day, and recorded as two ledger rows so the history adds up in each
 * currency. The swap is a compare-and-swap on both the currency and the
 * balance, so a purchase, refund or payment landing at the same moment makes
 * it stop and retry later rather than convert a stale figure.
 */
export async function alignWalletCurrency(
  user: { id: string; email: string },
  target: DisplayCurrencyCode,
  options: { convertBalance: boolean; rates?: DisplayRates; nowMs?: number },
): Promise<AlignResult> {
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { currency: true, walletBalanceKobo: true },
  });
  if (!current) return { ok: false, currency: target, error: "busy" };
  const from = walletCurrencyOf(current.currency);
  if (current.currency === target) return { ok: true, currency: target, changed: false };

  if (current.walletBalanceKobo === 0) {
    const swapped = await prisma.user.updateMany({
      where: { id: user.id, currency: current.currency, walletBalanceKobo: 0 },
      data: { currency: target },
    });
    return swapped.count === 1
      ? { ok: true, currency: target, changed: true }
      : { ok: false, currency: from, error: "busy" };
  }

  if (!options.convertBalance) return { ok: true, currency: from, changed: false };

  const nowMs = options.nowMs ?? Date.now();
  const recent = await prisma.auditLog.count({
    where: {
      targetId: user.id,
      action: CONVERSION_ACTION,
      createdAt: { gte: new Date(nowMs - 24 * 60 * 60 * 1000) },
    },
  });
  if (recent >= WALLET_CONVERSIONS_PER_DAY) return { ok: false, currency: from, error: "too_many_changes" };

  const rates = options.rates ?? (await getDisplayRates());
  const balance = current.walletBalanceKobo;
  const converted = convertMinor(balance, current.currency, target, rates);
  if (converted === null) return { ok: false, currency: from, error: "no_rate" };

  const moved = await prisma.$transaction(async (tx) => {
    const swapped = await tx.user.updateMany({
      where: { id: user.id, currency: current.currency, walletBalanceKobo: balance },
      data: { currency: target, walletBalanceKobo: converted },
    });
    if (swapped.count !== 1) return false;
    await tx.walletTransaction.createMany({
      data: [
        {
          userId: user.id,
          type: "ADJUSTMENT",
          provider: CURRENCY_MOVE_PROVIDER,
          amountKobo: -balance,
          currency: current.currency,
          description: `Balance moved to ${target}`,
        },
        {
          userId: user.id,
          type: "ADJUSTMENT",
          provider: CURRENCY_MOVE_PROVIDER,
          amountKobo: converted,
          currency: target,
          description: `Balance moved to ${target}`,
        },
      ],
    });
    return true;
  });
  if (!moved) return { ok: false, currency: from, error: "busy" };

  await recordAudit({
    actor: { id: user.id, email: user.email },
    action: CONVERSION_ACTION,
    targetType: "user",
    targetId: user.id,
    metadata: { from: current.currency, to: target, fromMinor: balance, toMinor: converted },
  }).catch((error) => console.error(`[wallet] could not audit currency move for ${user.id}:`, error));
  return { ok: true, currency: target, changed: true };
}

/** What an order actually took from the wallet, which is what a refund
 *  returns: the recorded charge, or for orders from before wallets were held
 *  in the customer's currency, the price in the order's currency. */
export function chargeOf(activation: {
  priceKobo: number;
  currency: string;
  chargeMinor: number | null;
  chargeCurrency: string | null;
}): { amountMinor: number; currency: string } {
  if (activation.chargeMinor !== null && activation.chargeCurrency) {
    return { amountMinor: activation.chargeMinor, currency: activation.chargeCurrency };
  }
  return { amountMinor: activation.priceKobo, currency: activation.currency };
}
