"use server";

import { getActiveUser } from "@/lib/session";
import { getUnreadNotificationCount, listRecentNotifications } from "@/lib/notifications";

export interface NotificationSummary {
  unreadCount: number;
  notifications: {
    id: string;
    title: string;
    body: string;
    ticketId: string;
    readAt: string | null;
  }[];
}

/**
 * Polled by NotificationBell so a notification that arrives while the tab is
 * already open (a customer opens a ticket, an admin replies) shows up — and
 * can trigger a sound — without waiting for the next page navigation.
 *
 * Deliberately takes no arguments: it always reads whichever account is
 * actually signed in right now via getActiveUser(), the same guard every
 * other dashboard mutation uses. A Server Action is a public, directly
 * callable endpoint, so this must never accept a caller-supplied userId —
 * that would let any signed-in visitor read anyone else's notification
 * count just by calling this with a different id.
 */
export async function getMyNotificationSummaryAction(): Promise<NotificationSummary | null> {
  const user = await getActiveUser();
  if (!user) return null;

  const [unreadCount, notifications] = await Promise.all([
    getUnreadNotificationCount(user.id),
    listRecentNotifications(user.id),
  ]);

  return {
    unreadCount,
    notifications: notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      ticketId: notification.ticketId,
      readAt: notification.readAt?.toISOString() ?? null,
    })),
  };
}
