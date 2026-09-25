import type { Metadata } from "next";
import { requireActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getResendEligibility } from "@/lib/verification";
import { getUnreadNotificationCount, listRecentNotifications } from "@/lib/notifications";
import { DashboardSidebar, DashboardTopBar } from "./dashboard-nav";
import { VerificationBanner } from "./verification-banner";

// A customer's wallet, orders and account settings must never be treated
// as public SEO content, whatever links to them. robots.txt's disallow
// keeps a well-behaved crawler out; this is what stops a linked URL from
// still being indexed bare.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Runs before every dashboard page. See requireActiveUser(): this is what
 * stops a suspended or deleted account from continuing to use a session
 * issued before that happened, since the proxy only ever checked the JWT.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireActiveUser();

  // Only queried for an unverified account: a verified customer (the
  // overwhelming majority of page loads) skips both queries entirely.
  const [eligibility, pendingRequest, unreadCount, notifications] = await Promise.all([
    user.emailVerified ? Promise.resolve(null) : getResendEligibility(user.id),
    user.emailVerified
      ? Promise.resolve(null)
      : prisma.manualVerificationRequest.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        }),
    getUnreadNotificationCount(user.id),
    listRecentNotifications(user.id),
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
      <DashboardSidebar notifications={notificationItems} unreadCount={unreadCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopBar notifications={notificationItems} unreadCount={unreadCount} />
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-9">
          <div className="mx-auto w-full max-w-4xl">
            {!user.emailVerified && eligibility ? (
              <div className="mb-5">
                <VerificationBanner
                  initialResendLimitReached={eligibility.limitReached}
                  initialManualStatus={
                    pendingRequest?.status === "PENDING"
                      ? "pending"
                      : pendingRequest?.status === "REJECTED"
                        ? "rejected"
                        : "none"
                  }
                />
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
