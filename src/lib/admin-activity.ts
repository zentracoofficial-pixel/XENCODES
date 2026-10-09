import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";

/**
 * One timeline of everything that happens on Xencodes, for the admin: new
 * users, wallet funding, number purchases and their outcome, support tickets
 * and email campaigns. Each lives in its own table with its own timestamp,
 * so each source is queried on its own and the results merged here.
 *
 * Paged by time rather than by offset: every source returns its newest
 * `limit` rows older than `before`, so the newest `limit` of the merged list
 * are exactly the newest `limit` overall, however many sources there are.
 */

export type ActivityKind = "users" | "funding" | "orders" | "support" | "email";

export const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
  { value: "users", label: "New users" },
  { value: "funding", label: "Funding" },
  { value: "orders", label: "Orders" },
  { value: "support", label: "Support" },
  { value: "email", label: "Email" },
];

export interface ActivityRow {
  key: string;
  href: string;
  title: string;
  subtitle: string;
  at: Date;
  badge: { label: string; variant: "success" | "warning" | "danger" | "neutral" };
}

const FAILED_STATUSES = ["EXPIRED", "CANCELLED", "REFUNDED"] as const;

export async function getRecentActivity({
  kinds,
  before,
  limit,
}: {
  /** Which kinds to include; all of them when omitted. */
  kinds?: ActivityKind[];
  /** Only events older than this. */
  before?: Date;
  limit: number;
}): Promise<ActivityRow[]> {
  const wants = (kind: ActivityKind) => !kinds || kinds.includes(kind);
  const older = before ? { lt: before } : undefined;

  const [users, funded, purchases, completed, failed, tickets, campaigns] = await Promise.all([
    wants("users")
      ? prisma.user.findMany({
          where: { deletedAt: null, ...(older ? { createdAt: older } : {}) },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, email: true, createdAt: true },
        })
      : [],
    wants("funding")
      ? prisma.walletTransaction.findMany({
          where: { type: "TOPUP", status: "SUCCESSFUL", ...(older ? { createdAt: older } : {}) },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { user: { select: { email: true } } },
        })
      : [],
    wants("orders")
      ? prisma.activation.findMany({
          where: older ? { createdAt: older } : {},
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { user: { select: { email: true } } },
        })
      : [],
    wants("orders")
      ? prisma.activation.findMany({
          where: { status: "RECEIVED", ...(older ? { updatedAt: older } : {}) },
          orderBy: { updatedAt: "desc" },
          take: limit,
          include: { user: { select: { email: true } } },
        })
      : [],
    wants("orders")
      ? prisma.activation.findMany({
          where: { status: { in: [...FAILED_STATUSES] }, ...(older ? { updatedAt: older } : {}) },
          orderBy: { updatedAt: "desc" },
          take: limit,
          include: { user: { select: { email: true } } },
        })
      : [],
    wants("support")
      ? prisma.supportTicket.findMany({
          where: older ? { createdAt: older } : {},
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { user: { select: { email: true } } },
        })
      : [],
    wants("email")
      ? prisma.emailCampaign.findMany({
          where: { status: { in: ["SENT", "FAILED"] }, ...(older ? { createdAt: older } : {}) },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : [],
  ]);

  const rows: ActivityRow[] = [
    ...users.map((user) => ({
      key: `user-${user.id}`,
      href: `/admin/users/${user.id}`,
      title: "New user registration",
      subtitle: user.email,
      at: user.createdAt,
      badge: { label: "New user", variant: "neutral" as const },
    })),
    ...funded.map((tx) => ({
      key: `funded-${tx.id}`,
      href: `/admin/wallet/${tx.id}`,
      title: "Wallet funding",
      subtitle: `${tx.user.email} · ${formatMoney(tx.amountKobo, tx.currency)}`,
      at: tx.createdAt,
      badge: { label: "Funded", variant: "success" as const },
    })),
    ...purchases.map((order) => ({
      key: `purchase-${order.id}`,
      href: `/admin/orders/${order.id}`,
      title: "Number purchase",
      subtitle: `${order.user.email} · ${order.serviceName} · ${order.countryName}`,
      at: order.createdAt,
      badge: { label: "Purchase", variant: "neutral" as const },
    })),
    ...completed.map((order) => ({
      key: `completed-${order.id}`,
      href: `/admin/orders/${order.id}`,
      title: "Completed activation",
      subtitle: `${order.user.email} · ${order.serviceName} · ${order.countryName}`,
      at: order.updatedAt,
      badge: { label: "Completed", variant: "success" as const },
    })),
    ...failed.map((order) => ({
      key: `failed-${order.id}`,
      href: `/admin/orders/${order.id}`,
      title: "Failed activation",
      subtitle: `${order.user.email} · ${order.serviceName} · ${order.countryName}`,
      at: order.updatedAt,
      badge: { label: "Failed", variant: "danger" as const },
    })),
    ...tickets.map((ticket) => ({
      key: `ticket-${ticket.id}`,
      href: `/admin/support/${ticket.id}`,
      title: "Support ticket",
      subtitle: `${ticket.user.email} · ${ticket.subject}`,
      at: ticket.createdAt,
      badge: { label: ticket.status, variant: "warning" as const },
    })),
    ...campaigns.map((campaign) => ({
      key: `campaign-${campaign.id}`,
      href: "/admin/email?tab=history",
      title: "Admin email campaign",
      subtitle: `${campaign.subject} · ${campaign.recipientCount} recipients`,
      at: campaign.createdAt,
      badge: {
        label: campaign.status,
        variant: campaign.status === "SENT" ? ("success" as const) : ("danger" as const),
      },
    })),
  ];

  return rows.sort((a, b) => b.at.getTime() - a.at.getTime() || a.key.localeCompare(b.key)).slice(0, limit);
}
