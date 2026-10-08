import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { auth } from "@/auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

// Next.js answers a request that renders this page with a real HTTP 404,
// never a 200 dressed up as an error page (a "soft 404"). noindex is belt
// and suspenders so nothing here is ever a candidate for the index.
export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you asked for does not exist on Xencodes.",
  robots: { index: false, follow: false },
};

const PLACES = [
  { href: "/services", title: "Supported services", body: "Every service you can get a number for." },
  { href: "/how-it-works", title: "How it works", body: "From choosing a service to receiving your code." },
  { href: "/pricing", title: "Pricing", body: "Pay per number, refunded when no code arrives." },
  { href: "/faq", title: "Questions", body: "Delivery times, refunds and payments." },
];

/**
 * Rendered for any URL nothing on Xencodes answers, including pages removed
 * in the 12 September 2026 rebuild that have no replacement (the blog, the
 * status page, the per-country and developer pages). Pages that do have a
 * replacement redirect to it instead (see next.config.ts), so arriving here
 * really does mean the page is gone.
 */
export default async function NotFound() {
  const session = await auth().catch(() => null);

  return (
    <>
      <Header signedIn={Boolean(session?.user?.id)} />
      <main className="flex-1">
        <Container className="py-16 sm:py-24">
          <div className="mx-auto max-w-xl text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-mint-soft text-forest">
              <Compass className="h-6 w-6" aria-hidden />
            </span>
            <p className="mt-5 font-mono text-sm font-medium text-forest">404</p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-balance">
              This page does not exist
            </h1>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground text-pretty">
              The link may be out of date, or the page was removed. You can
              still find a number for the service you need.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2.5">
              <Button href="/buy" variant="accent" size="lg">
                Get a number
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button href="/" variant="outline" size="lg">
                Go to the homepage
              </Button>
            </div>
          </div>

          <ul className="mx-auto mt-12 grid max-w-2xl gap-2.5 sm:grid-cols-2">
            {PLACES.map((place) => (
              <li key={place.href}>
                <Link
                  href={place.href}
                  className="group flex h-full items-start justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-mint/50 hover:bg-mint-soft/40"
                >
                  <span>
                    <span className="block text-sm font-semibold">{place.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{place.body}</span>
                  </span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-forest" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </main>
      <Footer />
    </>
  );
}
