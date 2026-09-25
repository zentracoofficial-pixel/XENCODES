import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { getUnreadNotificationCount, listRecentNotifications } from "@/lib/notifications";
import { AdminSidebar, AdminTopBar } from "./admin-nav";

// Belt and suspenders alongside robots.txt's disallow: this is what
// actually stops a URL under /admin from being indexed bare (no snippet)
// if it were ever linked from somewhere outside the app, since a
// disallowed-but-linked URL can still show up in results without this.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  const [unreadCount, notifications] = await Promise.all([
    getUnreadNotificationCount(admin.id),
    listRecentNotifications(admin.id),
  ]);
  const notificationItems = notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    body: notification.body,
    ticketId: notification.ticketId,
    readAt: notification.readAt?.toISOString() ?? null,
  }));

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar adminEmail={admin.email} notifications={notificationItems} unreadCount={unreadCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar notifications={notificationItems} unreadCount={unreadCount} />
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
