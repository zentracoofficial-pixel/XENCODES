import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Container } from "@/components/ui/container";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/numbers", label: "Virtual Numbers" },
      { href: "/services", label: "Services" },
      { href: "/countries", label: "Countries" },
      { href: "/pricing", label: "Pricing" },
      { href: "/how-it-works", label: "How It Works" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/api", label: "API Overview" },
      { href: "/api/features", label: "API Features" },
      { href: "/api/pricing", label: "API Pricing" },
      { href: "/developers/docs", label: "Documentation" },
      { href: "/developers/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/blog", label: "Blog" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
      { href: "/status", label: "System Status" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border">
      <Container className="py-12">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Smartphone className="h-3.5 w-3.5" />
              </span>
              Xencodes
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Virtual numbers and real-time SMS verification for legitimate
              account activation, testing, and developer workflows.
            </p>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-semibold text-foreground">
                {column.title}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Xencodes. All rights reserved.</p>
          <p className="max-w-xl sm:text-right">
            Xencodes is built for legitimate verification and testing only. It
            must not be used for fraud, impersonation, unauthorized access, or
            to bypass a platform&apos;s security controls or restrictions.
          </p>
        </div>
      </Container>
    </footer>
  );
}
