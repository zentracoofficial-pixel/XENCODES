"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock3,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Plus,
  Settings,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/layout/wordmark";
import { NotificationBell, type NotificationItem } from "@/components/notification-bell";
import { logoutAction } from "./actions";

const links = [
  { href: "/dashboard", label: "Dashboard", short: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/buy", label: "Buy Number", short: "Buy", icon: Plus },
  { href: "/dashboard/history", label: "History", short: "History", icon: Clock3 },
  { href: "/dashboard/wallet", label: "Wallet", short: "Wallet", icon: Wallet },
  { href: "/dashboard/support", label: "Support", short: "Support", icon: LifeBuoy },
];

/**
 * The phone navigation: all five sections at once, icon over a short label,
 * instead of a sideways-scrolling strip that cut off at "Wallet" and hid
 * "Support" entirely on a 390px screen with no sign there was more.
 */
function TabItems() {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
              active ? "bg-mint-soft text-forest" : "text-muted-foreground hover:bg-mint-soft hover:text-forest",
            )}
          >
            <link.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {link.short}
          </Link>
        );
      })}
    </>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-mint-soft text-forest"
                : "text-muted-foreground hover:bg-mint-soft hover:text-forest",
            )}
          >
            <link.icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

export function DashboardSidebar({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/" aria-label="Xencodes home">
          <Wordmark />
        </Link>
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          ticketBasePath="/dashboard/support"
          align="left"
        />
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3">
        <NavItems />
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/dashboard/settings"
          className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-mint-soft hover:text-forest"
        >
          <Settings className="h-4 w-4" />
          Account
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-mint-soft hover:text-forest"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function DashboardTopBar({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  return (
    <header className="border-b border-border bg-surface lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" aria-label="Xencodes home">
          <Wordmark className="text-base" />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            ticketBasePath="/dashboard/support"
          />
          <Link
            href="/dashboard/settings"
            aria-label="Account settings"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-mint-soft"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Log out"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-mint-soft"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
      <nav aria-label="Dashboard" className="grid grid-cols-5 gap-1 px-2 pb-2">
        <TabItems />
      </nav>
    </header>
  );
}
