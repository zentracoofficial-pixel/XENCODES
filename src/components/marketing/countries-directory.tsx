"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CountryCard } from "@/components/marketing/country-card";
import type { Country } from "@/data/types";

export function CountriesDirectory({ countries }: { countries: Country[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return countries.filter((country) =>
      country.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
  }, [countries, query]);

  return (
    <div>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search countries..."
          className="h-10 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          No countries match your search.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((country) => (
            <CountryCard key={country.slug} country={country} />
          ))}
        </div>
      )}
    </div>
  );
}
