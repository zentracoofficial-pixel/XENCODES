import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Wordmark } from "@/components/layout/wordmark";
import { SERVICE_PAGES } from "@/data/service-pages";

/**
 * Grouped so a visitor (and a crawler) can see the shape of the site at a
 * glance. The service pages are linked by what they are ("WhatsApp
 * verification number"), not by a bare brand name, and only the curated ones
 * that genuinely have their own page (see src/data/service-pages.ts).
 */
const columns: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/buy", label: "Get a number" },
      { href: "/services", label: "Supported services" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Popular",
    links: SERVICE_PAGES.map((page) => ({
      href: `/services/${page.slug}`,
      label: `${page.name} verification number`,
    })),
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
      { href: "/about#contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/refund-policy", label: "Refund policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <Container className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Virtual numbers for SMS verification, worldwide. Pay per number,
            refunded automatically when no code arrives.
          </p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                {column.title}
              </p>
              <ul className="mt-3 space-y-1">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="-mx-1 inline-block rounded px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>

      <div className="border-t border-border">
        <Container className="py-5">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Xencodes. Numbers are for receiving
            verification codes on accounts you own. Some brand icons by{" "}
            <a
              href="https://fontawesome.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Font Awesome
            </a>
            , licensed{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              CC BY 4.0
            </a>
            .
          </p>
        </Container>
      </div>
    </footer>
  );
}
