import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/lib/site";

export interface BreadcrumbItem {
  label: string;
  /** Omitted on the last (current) item: it isn't a link. */
  href?: string;
}

/**
 * The real navigation hierarchy, rendered once as both a visible trail and
 * matching BreadcrumbList structured data, so the two can never drift apart.
 * Every page that uses this actually sits under Home in the site's normal
 * navigation — this is not a hierarchy invented for search engines.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const full: BreadcrumbItem[] = [{ label: "Home", href: "/" }, ...items];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: full.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.label,
            ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
          })),
        }}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          {full.map((item, index) => {
            const isLast = index === full.length - 1;
            return (
              <li key={item.label} className="flex items-center gap-1.5">
                {index > 0 ? (
                  <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
                ) : null}
                {isLast || !item.href ? (
                  <span aria-current={isLast ? "page" : undefined} className="font-medium text-foreground">
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href} className="hover:text-foreground hover:underline">
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
