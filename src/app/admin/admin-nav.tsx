"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Package,
  RotateCcw,
  Settings,
  ShoppingBag,
  Tag,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { XenMark } from "@/components/layout/wordmark";
import { logoutAction } from "@/app/dashboard/actions";

const links = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/services", label: "Services", icon: Package },
  { href: "/admin/pricing", label: "Pricing", icon: Tag },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/refunds", label: "Refunds", icon: RotateCcw },
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
              "flex items-center gap-3 min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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

export function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-forest-dark lg:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <XenMark className="h-[22px] w-[22px] text-white" />
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[-0.02em] text-white">Xencodes</p>
          <p className="text-[11px] text-white/40">Admin</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        <NavItems />
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="truncate text-xs text-white/40">{adminEmail}</p>
        <Link
          href="/dashboard"
          className="mt-1.5 inline-block text-xs font-medium text-white/60 hover:text-white"
        >
          Back to customer app
        </Link>
        {/* Ends the session itself, not just the admin view: signOut()
            clears the auth cookie, so the next request arrives
            unauthenticated rather than still holding a valid admin token. */}
        <form action={logoutAction} className="mt-3">
          <button
            type="submit"
            className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function AdminTopBar() {
  return (
    <header className="flex h-14 items-center gap-2 bg-forest-dark px-4 lg:hidden">
      <XenMark className="h-5 w-5 text-white" />
      <p className="text-sm font-semibold text-white">Admin</p>
      <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
        <NavItems />
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Log out"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </nav>
    </header>
  );
}
