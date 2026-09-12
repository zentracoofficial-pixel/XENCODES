"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const primaryLinks = [
  { href: "/numbers", label: "Numbers" },
  { href: "/services", label: "Services" },
  { href: "/countries", label: "Countries" },
  { href: "/pricing", label: "Pricing" },
  { href: "/api", label: "API" },
];

const resourceLinks = [
  { href: "/developers", label: "Developers" },
  { href: "/developers/docs", label: "Documentation" },
  { href: "/blog", label: "Blog" },
  { href: "/faq", label: "FAQ" },
  { href: "/status", label: "System Status" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Smartphone className="h-4 w-4" />
          </span>
          Xencodes
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {primaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              {link.label}
            </Link>
          ))}

          <div
            className="relative"
            onMouseEnter={() => setResourcesOpen(true)}
            onMouseLeave={() => setResourcesOpen(false)}
          >
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              onClick={() => setResourcesOpen((v) => !v)}
            >
              Resources
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {resourcesOpen ? (
              <div className="absolute left-0 top-full pt-2">
                <div className="w-56 rounded-lg border border-border bg-card p-1.5 shadow-lg">
                  {resourceLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block rounded-md px-3 py-2 text-sm text-foreground/90 hover:bg-secondary transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          <ThemeToggle />
          <Button href="/login" variant="ghost" size="sm">
            Log in
          </Button>
          <Button href="/register" size="sm">
            Get started
          </Button>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-secondary"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "lg:hidden overflow-hidden border-t border-border transition-[max-height] duration-200 ease-in-out",
          mobileOpen ? "max-h-[32rem]" : "max-h-0 border-t-0",
        )}
      >
        <div className="flex flex-col gap-1 px-6 py-4">
          {[...primaryLinks, ...resourceLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/90 hover:bg-secondary"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
            <Button href="/login" variant="outline">
              Log in
            </Button>
            <Button href="/register">Get started</Button>
          </div>
        </div>
      </div>
    </header>
  );
}
