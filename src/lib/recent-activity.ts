import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";

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
      trailing: formatMoney(activation.priceKobo, activation.currency),
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
      trailing: formatMoney(Math.abs(tx.amountKobo), tx.currency),
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
