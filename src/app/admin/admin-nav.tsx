"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Coins,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Package,
  Plug,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { XenMark } from "@/components/layout/wordmark";
import { NotificationBell, type NotificationItem } from "@/components/notification-bell";
import { logoutAction } from "@/app/dashboard/actions";

/**
 * Nine screens, each of which does real work.
 *
 * Refunds live inside Orders, because a refund is something that happened
 * to an order. Pricing lives inside Services, because a margin is a
 * property of a service. Payments and wallet movements are one ledger, so
 * they are one page. Email campaign history lives inside Email as a tab,
 * not a page of its own, for the same reason. A category is not a reason
 * for a page.
 */
const links = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/services", label: "Services", icon: Package },
  { href: "/admin/providers", label: "Providers", icon: Plug },
  { href: "/admin/currencies", label: "Currencies", icon: Coins },
  { href: "/admin/wallet", label: "Wallet", icon: Wallet },
  { href: "/admin/email", label: "Email", icon: Mail },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function NavItems() {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex shrink-0 items-center gap-3 min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-white/10 text-white"
                : "text-white/55 hover:bg-white/5 hover:text-white/90",
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

export function AdminSidebar({
  adminEmail,
  notifications,
  unreadCount,
}: {
  adminEmail: string;
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-forest-dark lg:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <XenMark className="h-[22px] w-[22px] text-white" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-[-0.02em] text-white">Xencodes</p>
          <p className="text-[11px] text-white/40">Admin</p>
        </div>
        <div className="text-white [&_button]:text-white/70 [&_button:hover]:text-white [&_button:hover]:bg-white/10">
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            ticketBasePath="/admin/support"
          />
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        <NavItems />
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="truncate text-xs text-white/40">{adminEmail}</p>
        {/* Ends the session itself, not just the admin view: signOut()
            clears the auth cookie, so the next request arrives
            unauthenticated rather than still holding a valid admin token. */}
        <form action={logoutAction} className="mt-2">
          <button
            type="submit"
            className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function AdminTopBar({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  return (
    <header className="bg-forest-dark lg:hidden">
      <div className="flex h-14 items-center gap-2 px-4">
        <XenMark className="h-5 w-5 text-white" />
        <p className="text-sm font-semibold text-white">Admin</p>
        <div className="ml-auto flex items-center gap-1 text-white [&_button]:text-white/70 [&_button:hover]:text-white [&_button:hover]:bg-white/10">
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            ticketBasePath="/admin/support"
          />
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Log out"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        <NavItems />
      </nav>
    </header>
  );
}
