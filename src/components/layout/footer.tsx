import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Wordmark } from "@/components/layout/wordmark";

const links = [
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund-policy", label: "Refunds" },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Wordmark />
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Virtual numbers for SMS verification, priced in Naira.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2.5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
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
