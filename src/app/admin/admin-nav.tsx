"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Coins,
  HeartPulse,
  History,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  LogOut,
  Mail,
  Menu,
  Package,
  Plug,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { XenMark } from "@/components/layout/wordmark";
import { NotificationBell, type NotificationItem } from "@/components/notification-bell";
import { logoutAction } from "@/app/dashboard/actions";

/**
 * The same fourteen screens as before, grouped by what an operator is doing
 * so each one is quick to find. Refunds live inside Orders, pricing inside
 * Services, payments and wallet movements in one ledger (Wallet), campaign
 * history inside Email and provider failures inside Providers.
 */
const groups = [
  {
    label: "Overview",
    links: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/activity", label: "Recent activity", icon: Activity },
    ],
  },
  {
    label: "Sales",
    links: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
      { href: "/admin/sales", label: "Sales and profit", icon: LineChart },
      { href: "/admin/wallet", label: "Wallet", icon: Wallet },
    ],
  },
  {
    label: "Customers",
    links: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/support", label: "Support", icon: LifeBuoy },
      { href: "/admin/recovery", label: "Recovery", icon: HeartPulse },
      { href: "/admin/email", label: "Email", icon: Mail },
    ],
  },
  {
    label: "Catalogue",
    links: [
      { href: "/admin/services", label: "Services", icon: Package },
      { href: "/admin/providers", label: "Providers", icon: Plug },
      { href: "/admin/currencies", label: "Currencies", icon: Coins },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/admin/audit", label: "Activity log", icon: History },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

type NavLink = (typeof groups)[number]["links"][number];

function isActive(link: NavLink, pathname: string) {
  return "exact" in link && link.exact ? pathname === link.href : pathname.startsWith(link.href);
}

/** The screen the admin is on, for the top bar. */
function currentPage(pathname: string) {
  for (const group of groups) {
    for (const link of group.links) {
      if (isActive(link, pathname)) return { group: group.label, link };
    }
  }
  return null;
}

function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.links.map((link) => {
              const active = isActive(link, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-white/[0.09] text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white",
                  )}
                >
                  {active ? (
                    <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-mint" />
                  ) : null}
                  <link.icon
                    className={cn("h-4 w-4 shrink-0", active ? "text-mint" : "text-white/45 group-hover:text-white/80")}
                  />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function LogoutButton({ compact = false }: { compact?: boolean }) {
  // Ends the session itself, not just the admin view: signOut() clears the
  // auth cookie, so the next request arrives unauthenticated.
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label={compact ? "Log out" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white",
          compact ? "h-10 w-10 justify-center" : "min-h-10 w-full px-3",
        )}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {compact ? null : "Log out"}
      </button>
    </form>
  );
}

export function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const initial = adminEmail.trim().charAt(0).toUpperCase() || "A";
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-gradient-to-b from-forest to-forest-dark lg:flex">
      <Link href="/admin" className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
          <XenMark className="h-[18px] w-[18px] text-mint" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold tracking-[-0.02em] text-white">Xencodes</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Admin console</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
        <NavGroups />
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-bold text-forest-dark">
            {initial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-white">{adminEmail}</span>
            <span className="block text-[11px] text-white/40">Administrator</span>
          </span>
        </div>
        <div className="mt-2">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}

/**
 * The bar above every admin page: where you are, notifications and a way
 * back to the public site. On phones it also opens the full menu.
 */
export function AdminTopBar({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const page = currentPage(pathname);
  const deeper = page ? pathname !== page.link.href : false;

  return (
    <header className="sticky top-0 z-40">
      {/* Phones and tablets: dark bar with the menu. */}
      <div className="bg-forest-dark lg:hidden">
        <div className="flex h-14 items-center gap-2 px-4">
          <Link href="/admin" aria-label="Admin dashboard" className="flex items-center gap-2">
            <XenMark className="h-5 w-5 text-mint" />
            <span className="text-sm font-semibold text-white">{page?.link.label ?? "Admin"}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1 [&>div>button:first-child]:text-white/70 [&>div>button:first-child:hover]:bg-white/10 [&>div>button:first-child:hover]:text-white">
            <NotificationBell notifications={notifications} unreadCount={unreadCount} ticketBasePath="/admin/support" />
          </div>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen ? (
          <div className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-white/10 bg-gradient-to-b from-forest-dark to-forest px-3 pb-4 pt-4">
            <NavGroups onNavigate={() => setMenuOpen(false)} />
            <div className="mt-4 border-t border-white/10 pt-3">
              <LogoutButton />
            </div>
          </div>
        ) : null}
      </div>

      {/* Desktop: light bar with the page you are on. */}
      <div className="hidden h-16 items-center gap-4 border-b border-border bg-surface px-8 lg:flex">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">{page?.group ?? "Admin"}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          {page && deeper ? (
            <>
              <Link href={page.link.href} className="font-medium text-muted-foreground hover:text-foreground">
                {page.link.label}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              <span className="font-semibold text-foreground">Details</span>
            </>
          ) : (
            <span className="font-semibold text-foreground">{page?.link.label ?? "Admin"}</span>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-mint hover:text-foreground"
          >
            View site
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <div className="[&>div>button:first-child]:h-9 [&>div>button:first-child]:w-9 [&>div>button:first-child]:border [&>div>button:first-child]:border-border">
            <NotificationBell notifications={notifications} unreadCount={unreadCount} ticketBasePath="/admin/support" />
          </div>
        </div>
      </div>
    </header>
  );
}
