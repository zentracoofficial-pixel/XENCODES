"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { logoutAction } from "./actions";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/buy", label: "Buy Number" },
  { href: "/dashboard/history", label: "History" },
  { href: "/dashboard/wallet", label: "Wallet" },
  { href: "/support", label: "Support" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Smartphone className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Xencodes</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </form>
      </div>

      <nav className="flex md:hidden items-center gap-1 overflow-x-auto border-t border-border px-4 py-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              pathname === link.href
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
