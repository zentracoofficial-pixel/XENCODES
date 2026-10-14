import { prisma } from "@/lib/prisma";

/**
 * One merged, compact feed for the dashboard's "Recent activity" section:
 * purchases, completed SMS, wallet funding, refunds, and support activity,
 * interleaved by time rather than shown as separate lists. Every item is a
 * real row from an existing table — nothing here is synthesized, and
 * refunds/top-ups are read from WalletTransaction exactly as the wallet
 * page itself reads them, so this can never disagree with the ledger.
 */

export type ActivityKind = "purchase" | "sms_received" | "topup" | "refund" | "support";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  trailing?: string;
  /** A money amount for the trailing slot, rendered in the display currency. */
  trailingAmount?: {
    kobo: number;
    currency: string;
    /** The amount as the customer saw it at the time, when recorded. */
    recorded?: { currency: string | null; minor: number | null } | null;
  };
  href?: string;
  createdAt: Date;
}

export async function getRecentActivity(userId: string, limit = 6): Promise<ActivityItem[]> {
  const [activations, walletRows, tickets] = await Promise.all([
    prisma.activation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.walletTransaction.findMany({
      where: { userId, type: { in: ["TOPUP", "REFUND"] }, status: "SUCCESSFUL" },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  // A refund shows the price the customer saw when they bought, the same as
  // the purchase it reverses.
  const refundOrderIds = walletRows
    .filter((tx) => tx.type === "REFUND" && tx.activationId)
    .map((tx) => tx.activationId as string);
  const shownPrices = new Map(
    (refundOrderIds.length
      ? await prisma.activation.findMany({
          where: { id: { in: refundOrderIds }, userId },
          select: { id: true, displayCurrency: true, displayPriceMinor: true },
        })
      : []
    ).map((a) => [a.id, { currency: a.displayCurrency, minor: a.displayPriceMinor }]),
  );

  const items: ActivityItem[] = [];

  for (const activation of activations) {
    // One purchase can produce up to two entries — "bought" and, later,
    // "code received" — since both are real, separately timestamped events
    // a customer cares about. A still-waiting or otherwise-closed order
    // only ever contributes the purchase entry.
    items.push({
      id: `activation-${activation.id}-purchase`,
      kind: "purchase",
      title: `Bought a ${activation.serviceName} number`,
      subtitle: activation.countryName,
      trailingAmount: {
        kobo: activation.priceKobo,
        currency: activation.currency,
        recorded: { currency: activation.displayCurrency, minor: activation.displayPriceMinor },
      },
      href: `/dashboard/buy?activation=${activation.id}`,
      createdAt: activation.createdAt,
    });
    if (activation.status === "RECEIVED" && activation.receivedAt) {
      items.push({
        id: `activation-${activation.id}-sms`,
        kind: "sms_received",
        title: `Code received for ${activation.serviceName}`,
        subtitle: activation.countryName,
        trailing: activation.code ?? undefined,
        href: `/dashboard/buy?activation=${activation.id}`,
        createdAt: activation.receivedAt,
      });
    }
  }

  for (const tx of walletRows) {
    items.push({
      id: `wallet-${tx.id}`,
      kind: tx.type === "TOPUP" ? "topup" : "refund",
      title: tx.type === "TOPUP" ? "Wallet funded" : "Refund credited",
      subtitle: tx.description,
      trailingAmount: {
        kobo: Math.abs(tx.amountKobo),
        currency: tx.currency,
        // A top-up shows what it added to the balance, converted the same
        // way the balance is, so the two always agree.
        recorded: tx.type === "REFUND" && tx.activationId ? shownPrices.get(tx.activationId) : null,
      },
      href: "/dashboard/wallet",
      createdAt: tx.completedAt ?? tx.createdAt,
    });
  }

  for (const ticket of tickets) {
    items.push({
      id: `ticket-${ticket.id}`,
      kind: "support",
      title: "Support ticket opened",
      subtitle: ticket.subject,
      href: `/dashboard/support/${ticket.id}`,
      createdAt: ticket.createdAt,
    });
  }

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
