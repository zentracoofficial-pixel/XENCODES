import { prisma } from "@/lib/prisma";
import { WalletTransactionType } from "@/generated/prisma/client";
import { creditBalanceInTx } from "@/lib/wallet-currency";

/** Whatever object prisma.$transaction's own callback receives: accepting
 *  this shape (rather than importing a specific generated type name) lets
 *  creditWallet join a transaction its caller already opened, without this
 *  file needing to track exactly what Prisma calls that type internally. */
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Moves a balance and records why, atomically.
 *
 * Used for refunds and admin adjustments only. TOPUP is deliberately not
 * an accepted type here, not just by convention: a WalletTransaction's
 * status defaults to SUCCESSFUL, so a TOPUP created through this function
 * would credit a balance immediately with no payment ever having been
 * verified, which is exactly the "test funding leaks into production"
 * failure mode. Crediting money a customer actually paid in is
 * completeTopUp() in src/lib/funding.ts, which only runs after a payment
 * has been verified with the payment provider and only ever moves a row
 * that already exists as PENDING to SUCCESSFUL, once.
 *
 * Accepts an optional transaction client so a caller that must atomically
 * pair this credit with another write (for example, an activation's status
 * flip from WAITING to EXPIRED/CANCELLED/REFUNDED) can run both inside one
 * transaction rather than two, closing the window where the status flip
 * commits but the credit does not, or vice versa. With no client given,
 * this opens its own transaction exactly as before.
 */
export async function creditWallet(
  userId: string,
  amountKobo: number,
  type: Extract<WalletTransactionType, "REFUND" | "ADJUSTMENT">,
  description: string,
  /** ISO 4217, the currency amountKobo is actually denominated in: what the
   *  refunded order was charged in, or the target account's currency for an
   *  admin adjustment. Converted into the wallet's currency if they differ. */
  currency: string,
  activationId?: string,
  tx?: TransactionClient,
) {
  const run = async (client: TransactionClient) => {
    // Lands in whatever currency the wallet is held in right now: a refund
    // for an order bought before the customer moved their balance to another
    // currency is converted at today's rate, never added in the wrong unit.
    const applied = await creditBalanceInTx(client, userId, amountKobo, currency);
    await client.walletTransaction.create({
      data: {
        userId,
        amountKobo: applied.amountMinor,
        type,
        description,
        currency: applied.currency,
        activationId,
      },
    });
    return applied;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
