"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMyNotificationSummaryAction } from "./notification-bell-actions";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  ticketId: string;
  readAt: string | null;
}

const POLL_INTERVAL_MS = 5000;

/**
 * Module-scoped, not component state: the sidebar's bell and the mobile
 * topbar's bell are both always mounted at once (Tailwind's `hidden lg:flex`
 * / `lg:hidden` only toggles CSS display, not whether the component exists),
 * so both instances poll independently and would both notice the exact same
 * new arrival at roughly the exact same moment. This throttles the *sound*
 * globally across every NotificationBell in this tab to once per short
 * window, without affecting each instance's own (per-instance, always
 * correct) detection of "did my count just go up" — so a real second
 * notification arriving even a few seconds later still dings normally.
 */
let lastAnnouncedAt = 0;
const ANNOUNCE_THROTTLE_MS = 2000;

/**
 * A short two-tone "ding" synthesized with the Web Audio API, so this needs
 * no audio asset file. Wrapped in a try/catch because both the API itself
 * and a browser's autoplay policy can refuse this outright — a missed sound
 * is not worth surfacing as an error.
 */
function playNotificationSound() {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(1108.73, now + 0.12);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.35);
    oscillator.onended = () => void ctx.close();
  } catch {
    // No Web Audio support, or the browser blocked it. Silence is fine.
  }
}

/**
 * Shared between the customer dashboard and the admin panel: a bell with a
 * real unread count, a dropdown of real stored notifications, each linking
 * straight to the ticket it's about.
 *
 * The dropdown is `fixed` and anchored to the viewport's own corner (not
 * `absolute` against the bell's own position), so it can never overflow the
 * page regardless of where the bell itself sits — including the sidebar,
 * where the bell is near the *left* edge of the screen but a naive
 * right-anchored panel would extend off-screen to the left.
 *
 * Polls the server every 20s for new notifications and plays a sound the
 * moment the unread count goes up, so a reply is heard even if this tab
 * isn't the one currently in focus. The count and list themselves are never
 * decided here — see notification-bell-actions.ts — this only displays what
 * the server reports and navigates on click.
 */
export function NotificationBell({
  notifications,
  unreadCount,
  ticketBasePath,
  align = "right",
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  ticketBasePath: string;
  /** Which viewport corner the dropdown opens from. Use "left" when the
   *  bell itself sits near the left edge of the screen (the sidebar). */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(notifications);
  const [count, setCount] = useState(unreadCount);
  // The last props this component actually synced from, so a fresh render
  // with new props can be told apart from a re-render triggered by our own
  // state (opening the dropdown, the poll below finding something new).
  const [syncedNotifications, setSyncedNotifications] = useState(notifications);
  const [syncedUnreadCount, setSyncedUnreadCount] = useState(unreadCount);
  const router = useRouter();
  const lastSeenCount = useRef(unreadCount);

  // Adjusting state during render rather than in an effect — the pattern
  // React's own docs recommend for "reset state when a prop changes"
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // The server-rendered props are the ground truth on every navigation —
  // most importantly, opening a ticket is what actually marks it read, and
  // that's a fresh set of props landing here after the page changes. The
  // poll below only ever adds new information *between* navigations.
  if (notifications !== syncedNotifications || unreadCount !== syncedUnreadCount) {
    setSyncedNotifications(notifications);
    setSyncedUnreadCount(unreadCount);
    setItems(notifications);
    setCount(unreadCount);
  }

  // Refs are read/written outside of render, never inside it — this is the
  // one place lastSeenCount is kept in sync with the (possibly just-reset)
  // unreadCount above, so the poll below always compares against the latest
  // real value rather than a stale one from an earlier render.
  useEffect(() => {
    lastSeenCount.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    const id = setInterval(async () => {
      const summary = await getMyNotificationSummaryAction();
      if (!summary) return;
      if (summary.unreadCount > lastSeenCount.current) {
        const now = Date.now();
        if (now - lastAnnouncedAt > ANNOUNCE_THROTTLE_MS) {
          playNotificationSound();
          lastAnnouncedAt = now;
        }
      }
      lastSeenCount.current = summary.unreadCount;
      setCount(summary.unreadCount);
      setItems(summary.notifications);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-mint-soft hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {count > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {count > 9 ? "9+" : count}
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
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            className={cn(
              "fixed top-16 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-lg",
              align === "left" ? "left-4" : "right-4",
            )}
          >
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
            </div>
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nothing yet.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {items.map((notification) => (
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
