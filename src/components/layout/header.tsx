"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";

const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

export function Header({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link href="/" aria-label="Xencodes home">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button href={signedIn ? "/dashboard" : "/login"} variant="ghost" size="sm">
            {signedIn ? "Dashboard" : "Log in"}
          </Button>
          <Button href="/buy" size="sm">
            Get a Number
          </Button>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-mint-soft md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={cn(
          "overflow-hidden border-border transition-[max-height] duration-200 ease-out md:hidden",
          open ? "max-h-80 border-t" : "max-h-0",
        )}
      >
        <div className="flex flex-col gap-1 px-5 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-mint-soft"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              href={signedIn ? "/dashboard" : "/login"}
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {signedIn ? "Dashboard" : "Log in"}
            </Button>
            <Button href="/buy" onClick={() => setOpen(false)}>
              Get a Number
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
