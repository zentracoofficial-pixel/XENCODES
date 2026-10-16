import Link from "next/link";
import { cn } from "@/lib/utils";
import { pageWindow } from "@/lib/pagination";

/**
 * Previous / numbered pages / Next under a long list, as plain links so it
 * works without scripts and each page has its own address. `params` carries
 * the other query values (filters, sort) through every link.
 */
export function Pagination({
  basePath,
  params = {},
  pageParam = "page",
  page,
  totalPages,
  total,
  from,
  to,
  className,
}: {
  basePath: string;
  params?: Record<string, string | undefined>;
  pageParam?: string;
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  className?: string;
}) {
  if (total === 0) return null;

  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    if (target > 1) query.set(pageParam, String(target));
    const text = query.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  const button = "inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors";

  return (
    <nav aria-label="Pages" className={cn("flex flex-col items-center justify-between gap-3 sm:flex-row", className)}>
      <p className="text-xs text-muted-foreground">
        Showing {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </p>
      {totalPages > 1 ? (
        <ul className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link
              href={href(page - 1)}
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : undefined}
              className={cn(button, "border-border", page <= 1 ? "pointer-events-none opacity-40" : "hover:border-mint hover:bg-mint-soft")}
            >
              Previous
            </Link>
          </li>
          {pageWindow(page, totalPages).map((entry, index) =>
            entry === null ? (
              <li key={`gap-${index}`} aria-hidden className="hidden px-1 text-sm text-muted-foreground sm:block">
                …
              </li>
            ) : (
              <li key={entry} className="hidden sm:block">
                <Link
                  href={href(entry)}
                  aria-current={entry === page ? "page" : undefined}
                  className={cn(button, entry === page ? "border-forest bg-forest text-white" : "border-border hover:border-mint hover:bg-mint-soft")}
                >
                  {entry}
                </Link>
              </li>
            ),
          )}
          <li className="text-xs text-muted-foreground sm:hidden">
            {page} / {totalPages}
          </li>
          <li>
            <Link
              href={href(page + 1)}
              aria-disabled={page >= totalPages}
              tabIndex={page >= totalPages ? -1 : undefined}
              className={cn(button, "border-border", page >= totalPages ? "pointer-events-none opacity-40" : "hover:border-mint hover:bg-mint-soft")}
            >
              Next
            </Link>
          </li>
        </ul>
      ) : null}
    </nav>
  );
}
