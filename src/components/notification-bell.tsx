"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  ticketId: string;
  readAt: string | null;
}

/**
 * Shared between the customer dashboard and the admin panel: a bell with a
 * real unread count, a dropdown of real stored notifications, each linking
 * straight to the ticket it's about. Nothing here decides what counts as
 * unread or marks anything read — both come from the server (see
 * src/lib/notifications.ts); this only displays what it was handed and
 * navigates on click. router.refresh() on click keeps the badge accurate
 * the moment the linked ticket page (which is what actually marks the
 * notification read) has loaded, without needing to poll.
 */
export function NotificationBell({
  notifications,
  unreadCount,
  ticketBasePath,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  ticketBasePath: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-mint-soft hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          {/* Closes the dropdown on an outside click without a document
              listener: a full-viewport layer beneath the panel, above
              everything else. */}
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
            </div>
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nothing yet.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <Link
                      href={`${ticketBasePath}/${notification.ticketId}`}
                      onClick={() => {
                        setOpen(false);
                        router.refresh();
                      }}
                      className={cn(
                        "block px-4 py-3 transition-colors hover:bg-background",
                        !notification.readAt && "bg-mint-soft/40",
                      )}
                    >
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {!notification.readAt ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />
                        ) : null}
                        <span className="truncate">{notification.title}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {notification.body}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
