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
import { logoutAction } from "./actions";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/buy", label: "Buy Number", icon: Plus },
  { href: "/dashboard/history", label: "History", icon: Clock3 },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
];

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

export function DashboardSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="Xencodes home">
          <Wordmark />
        </Link>
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

export function DashboardTopBar() {
  return (
    <header className="border-b border-border bg-surface lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" aria-label="Xencodes home">
          <Wordmark className="text-base" />
        </Link>
        <div className="flex items-center gap-1">
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
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        <NavItems />
      </nav>
    </header>
  );
}
