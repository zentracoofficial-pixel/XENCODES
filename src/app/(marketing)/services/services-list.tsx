"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceLogo } from "@/components/marketing/service-logo";

/**
 * A directory row. No price: a number's price depends on the country, and
 * the only figure worth showing is the live one resolved on the buy page
 * for the exact pair being bought.
 */
export interface DirectoryEntry {
  slug: string;
  name: string;
  color: string;
  category: string;
}

export function ServicesList({
  services,
  categories,
}: {
  services: DirectoryEntry[];
  categories: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((service) => {
      const matchesQuery = !q || service.name.toLowerCase().includes(q);
      const matchesCategory = !category || service.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [services, query, category]);

  return (
    <div>
      <div className="relative max-w-md">
        <label htmlFor="service-search" className="sr-only">
          Search services
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
        <input
          id="service-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <FilterChip active={category === null} onClick={() => setCategory(null)}>
          All
        </FilterChip>
        {categories.map((item) => (
          <FilterChip
            key={item}
            active={category === item}
            onClick={() => setCategory(category === item ? null : item)}
          >
            {item}
          </FilterChip>
        ))}
      </div>

      {results.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nothing matches that search. Try another name.
        </p>
      ) : (
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {results.map((service) => (
            <li key={service.slug}>
              <Link
                href={`/buy?service=${service.slug}`}
                className="group flex items-center gap-3.5 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-mint hover:bg-mint-soft"
              >
                <ServiceLogo
                  slug={service.slug}
                  name={service.name}
                  color={service.color}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{service.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {service.category}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-forest">
                  Check price
                </p>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-forest" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center rounded-lg border px-3.5 text-xs font-medium transition-colors",
        active
          ? "border-forest bg-forest text-white"
          : "border-border text-muted-foreground hover:border-mint hover:bg-mint-soft hover:text-forest",
      )}
    >
      {children}
    </button>
  );
}
