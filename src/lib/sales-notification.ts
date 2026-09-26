import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, EmailDeliveryError } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { walletFundingSaleEmail, numberPurchaseSaleEmail } from "@/lib/email-messages";
import { SALES_NOTIFICATION_EMAIL } from "@/lib/site";
import { formatMoney } from "@/lib/currency";
import { ORDER_STATUS_LABEL } from "@/lib/activation-status";

/**
 * One admin email whenever a real sale completes: a wallet top up KoraPay
 * has actually confirmed and completeTopUp() has actually credited, or a
 * number purchase whose order and wallet debit purchaseNumberAction() has
 * actually committed. Nothing here decides whether a sale happened —
 * src/lib/funding.ts and src/app/dashboard/buy/actions.ts already do, the
 * same way they always have, and each calls in here exactly once, from the
 * one place that already knows the money moved.
 *
 * This file never runs a transaction backward. A failure anywhere below —
 * a bad email address, Resend down, a database hiccup while recording the
 * attempt — is caught, logged, and left there. It cannot un-credit a
 * wallet or cancel an order, because neither of those functions is ever
 * called from here.
 */

type NotificationType = "WALLET_TOPUP" | "NUMBER_PURCHASE";

/**
 * Reserves the one notification slot a transaction is allowed, sends, and
 * records the outcome. The reservation is a plain INSERT racing against
 * SalesNotification's `@@unique([type, transactionId])` — the same shape as
 * every other idempotency guard in this codebase (Activation.idempotencyKey,
 * WalletTransaction.providerReference): the database's own constraint, not
 * an in-memory check, is what makes two concurrent callers for the same
 * transaction resolve to exactly one send. The row is inserted *before* the
 * send is attempted, optimistically as SENT, and corrected to FAILED
 * afterward if it did not go out — so a second caller that loses the race
 * sees the row already exists and never reaches sendEmail() at all, rather
 * than discovering the duplicate only after also sending.
 */
async function reserveAndSend(
  type: NotificationType,
  transactionId: string,
  render: () => { subject: string; html: string; text: string },
): Promise<void> {
  const recipient = SALES_NOTIFICATION_EMAIL;

  let reservationId: string;
  try {
    const reserved = await prisma.salesNotification.create({
      data: { type, transactionId, recipient, status: "SENT" },
    });
    reservationId = reserved.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      console.log(`[sales-notification] duplicate prevented: ${type} ${transactionId} already notified.`);
      return;
    }
    console.error(`[sales-notification] failed to reserve ${type} ${transactionId}:`, error);
    return;
  }

  console.log(`[sales-notification] queued: ${type} ${transactionId} -> ${recipient}`);

  try {
    const { subject, html, text } = render();
    const { id } = await sendEmail({ to: recipient, subject, html, text });
    await prisma.salesNotification
      .update({ where: { id: reservationId }, data: { providerMessageId: id } })
      .catch((dbError) => {
        console.error(`[sales-notification] sent but failed to record message id for ${transactionId}:`, dbError);
      });
    console.log(`[sales-notification] sent: ${type} ${transactionId}`);
  } catch (error) {
    const reason =
      error instanceof EmailDeliveryError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown error sending sales notification.";
    console.error(`[sales-notification] failed: ${type} ${transactionId}:`, reason);
    await prisma.salesNotification
      .update({ where: { id: reservationId }, data: { status: "FAILED", failureReason: reason } })
      .catch((dbError) => {
        console.error(`[sales-notification] failed to record failure for ${transactionId}:`, dbError);
      });
  }
}

/**
 * Called once, by completeTopUp() in src/lib/funding.ts, immediately after
 * the transaction that flips a TOPUP row PENDING -> SUCCESSFUL and credits
 * the wallet. Never called for a PURCHASE, REFUND or ADJUSTMENT row: those
 * are not a new payment, and a PURCHASE in particular is the wallet-side
 * half of a number purchase, whose own sale notification comes from
 * notifyNumberPurchaseSale() instead — crediting both would double-count
 * one sale as two.
 */
export async function notifyWalletFundingSale(walletTransactionId: string): Promise<void> {
  const row = await prisma.walletTransaction.findUnique({
    where: { id: walletTransactionId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!row) {
    console.error(`[sales-notification] wallet transaction ${walletTransactionId} not found; nothing to notify.`);
    return;
  }
  // Defensive: this function is only ever called from the one call site
  // that already checked both, but never send on anything else.
  if (row.type !== "TOPUP" || row.status !== "SUCCESSFUL") {
    console.error(
      `[sales-notification] refusing to notify wallet transaction ${walletTransactionId}: type=${row.type} status=${row.status}.`,
    );
    return;
  }

  await reserveAndSend("WALLET_TOPUP", row.id, () =>
    renderEmail(
      walletFundingSaleEmail({
        transactionId: row.id,
        userId: row.user.id,
        customerEmail: row.user.email,
        customerName: row.user.name,
        amount: formatMoney(row.amountKobo, row.currency),
        currency: row.currency,
        korapayReference: row.providerReference,
        providerTransactionId: row.providerTransactionId,
        completedAt: row.completedAt ?? new Date(),
      }),
    ),
  );
}

/**
 * Called once, by purchaseNumberAction() in
 * src/app/dashboard/buy/actions.ts, immediately after the transaction that
 * creates the Activation and debits the wallet for it commits. That
 * transaction is the sale: there is no separate "purchase became
 * successful" event later (RECEIVED is about the SMS code arriving, not
 * about payment), so this fires at creation, not on RECEIVED.
 */
export async function notifyNumberPurchaseSale(activationId: string): Promise<void> {
  const row = await prisma.activation.findUnique({
    where: { id: activationId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!row) {
    console.error(`[sales-notification] activation ${activationId} not found; nothing to notify.`);
    return;
  }

  await reserveAndSend("NUMBER_PURCHASE", row.id, () =>
    renderEmail(
      numberPurchaseSaleEmail({
        orderId: row.id,
        userId: row.user.id,
        customerEmail: row.user.email,
        serviceName: row.serviceName,
        countryName: row.countryName,
        price: formatMoney(row.priceKobo, row.currency),
        currency: row.currency,
        provider: row.provider,
        providerOrderId: row.providerOrderId,
        orderStatusLabel: ORDER_STATUS_LABEL[row.status],
        createdAt: row.createdAt,
      }),
    ),
  );
}
