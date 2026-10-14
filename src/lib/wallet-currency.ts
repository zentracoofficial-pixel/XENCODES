import { prisma } from "@/lib/prisma";
import { recordAudit, SYSTEM_ACTOR } from "@/lib/audit";
import { convertMoneyMinor, type DisplayRates } from "@/lib/display-currency";
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
      const converted = convertMoneyMinor(amountMinor, currency, user.currency, knownRates);
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
  const converted = convertMoneyMinor(balance, current.currency, target, rates);
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
    // rateBasis marks a move made at the market rate (see
    // correctUnderpaidMoves() for moves made before it was).
    metadata: { from: current.currency, to: target, fromMinor: balance, toMinor: converted, rateBasis: "market" },
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

const CORRECTION_ACTION = "wallet.currency.correct";

/**
 * Makes good money that was converted out of or into Naira at the platform's
 * pricing rate instead of the market rate (balance moves and Naira payments
 * into non-Naira wallets made before the market Naira rate was used). Each
 * affected customer is credited the difference at today's market rate, never
 * debited, once: every row checked is recorded in the audit log, under an
 * advisory lock, so running this again changes nothing.
 *
 * Runs after the exchange rates are refreshed; does nothing without a fresh
 * market Naira rate. Returns how many customers were credited.
 */
export async function correctUnderpaidMoves(rates?: DisplayRates): Promise<number> {
  const r = rates ?? (await getDisplayRates());
  if (!r.marketNgnPerUsd) return 0;

  const checked = new Set(
    (await prisma.auditLog.findMany({ where: { action: CORRECTION_ACTION }, select: { metadata: true } }))
      .map((row) => (row.metadata as { sourceId?: unknown } | null)?.sourceId)
      .filter((id): id is string => typeof id === "string"),
  );

  type Candidate = { sourceId: string; userId: string; currency: string; paidMinor: number; correctMinor: number };
  const candidates: Candidate[] = [];

  // Balance moves to or from Naira made before moves were done at the market rate.
  const moves = await prisma.auditLog.findMany({ where: { action: CONVERSION_ACTION } });
  for (const move of moves) {
    const meta = move.metadata as Record<string, unknown> | null;
    if (!meta || meta.rateBasis === "market" || checked.has(move.id) || !move.targetId) continue;
    const { from, to, fromMinor, toMinor } = meta;
    if (typeof from !== "string" || typeof to !== "string") continue;
    if (typeof fromMinor !== "number" || typeof toMinor !== "number") continue;
    if (from !== "NGN" && to !== "NGN") continue;
    const correct = convertMoneyMinor(fromMinor, from, to, r);
    if (correct === null) continue;
    candidates.push({ sourceId: move.id, userId: move.targetId, currency: to, paidMinor: toMinor, correctMinor: correct });
  }

  // Naira payments into a wallet held in another currency, credited at the
  // pricing rate. Such rows only exist since wallets could be held in other
  // currencies; a gap over 5% cannot be day-to-day rate movement.
  const topUps = await prisma.walletTransaction.findMany({
    where: { type: "TOPUP", status: "SUCCESSFUL", paymentCurrency: "NGN", NOT: { currency: "NGN" } },
  });
  for (const row of topUps) {
    if (checked.has(row.id) || row.paymentAmountMinor === null) continue;
    const paidNgn = row.paymentAmountMinor - (row.paymentFeeMinor ?? 0);
    const correct = convertMoneyMinor(paidNgn, "NGN", row.currency, r);
    if (correct === null || correct - row.amountKobo <= correct * 0.05) continue;
    candidates.push({ sourceId: row.id, userId: row.userId, currency: row.currency, paidMinor: row.amountKobo, correctMinor: correct });
  }

  let credited = 0;
  for (const c of candidates) {
    try {
      const did = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('wallet-currency-correction'))`;
        const already = await tx.auditLog.findFirst({
          where: { action: CORRECTION_ACTION, targetId: c.userId, metadata: { path: ["sourceId"], equals: c.sourceId } },
          select: { id: true },
        });
        if (already) return false;
        const diff = c.correctMinor - c.paidMinor;
        let applied: { amountMinor: number; currency: string } | null = null;
        if (diff > 0) {
          applied = await creditBalanceInTx(tx, c.userId, diff, c.currency, r);
          await tx.walletTransaction.create({
            data: {
              userId: c.userId,
              type: "ADJUSTMENT",
              amountKobo: applied.amountMinor,
              currency: applied.currency,
              description: "Correction: converted at the market rate",
            },
          });
        }
        await tx.auditLog.create({
          data: {
            actorId: SYSTEM_ACTOR.id,
            actorEmail: SYSTEM_ACTOR.email,
            action: CORRECTION_ACTION,
            targetType: "user",
            targetId: c.userId,
            metadata: {
              sourceId: c.sourceId,
              currency: c.currency,
              paidMinor: c.paidMinor,
              correctMinor: c.correctMinor,
              creditedMinor: applied?.amountMinor ?? 0,
              creditedCurrency: applied?.currency ?? c.currency,
            },
          },
        });
        return diff > 0;
      });
      if (did) credited += 1;
    } catch (error) {
      console.error(`[wallet] could not correct ${c.sourceId} for ${c.userId}:`, error);
    }
  }
  return credited;
}
