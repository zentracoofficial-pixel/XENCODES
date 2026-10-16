"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";
import { CurrencySelector } from "@/components/currency/currency-selector";

const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/countries", label: "Countries" },
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/guides", label: "Guides" },
  { href: "/faq", label: "FAQ" },
];

export function Header({
  signedIn: signedInProp = false,
  showCurrency = true,
  detectSession = false,
}: {
  signedIn?: boolean;
  /** The currency picker needs the visitor's own cookie, which a page served
   *  from the cache cannot read, so those pages leave it out. */
  showCurrency?: boolean;
  /** For pages served from the cache: ask after load whether the visitor is
   *  signed in, to show "Dashboard" instead of "Log in". */
  detectSession?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [detected, setDetected] = useState(false);
  const signedIn = signedInProp || detected;

  useEffect(() => {
    if (!detectSession) return;
    let live = true;
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { id?: string } } | null) => {
        if (live && data?.user?.id) setDetected(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [detectSession]);

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
          {showCurrency ? <CurrencySelector /> : null}
          <Button href={signedIn ? "/dashboard" : "/login"} variant="ghost" size="sm">
            {signedIn ? "Dashboard" : "Log in"}
          </Button>
          {/* Signed in: /buy redirects straight to the dashboard buy flow
              anyway. Signed out: skip the browse-first page and go straight
              to sign-up, since that is the actual next step for a new
              visitor clicking a primary CTA. */}
          <Button href={signedIn ? "/buy" : "/register"} size="sm">
            Get a Number
          </Button>
        </div>

        <div className="-mr-1 flex items-center gap-1 md:hidden">
        {showCurrency ? <CurrencySelector /> : null}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-mint-soft"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden border-border transition-[max-height] duration-200 ease-out md:hidden",
          open ? "max-h-[28rem] border-t" : "max-h-0",
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
            <Button href={signedIn ? "/buy" : "/register"} onClick={() => setOpen(false)}>
              Get a Number
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
