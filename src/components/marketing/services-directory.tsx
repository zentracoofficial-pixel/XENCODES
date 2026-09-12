"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { countAvailableCountries } from "@/data/services";
import { AvailabilityBadge } from "@/components/marketing/availability-badge";
import { formatNairaFromNaira } from "@/lib/currency";
import type { Service, ServiceCategory } from "@/data/types";

function overallAvailability(service: Service) {
  if (service.availability.some((a) => a.status === "available")) return "available" as const;
  if (service.availability.some((a) => a.status === "limited")) return "limited" as const;
  return "unavailable" as const;
}

const categories: (ServiceCategory | "All")[] = [
  "All",
  "Social & Messaging",
  "Marketplaces & Freelance",
  "Developer & Cloud",
  "Finance & Shopping",
  "Dating",
];

export function ServicesDirectory({ services }: { services: Service[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");

  const filtered = useMemo(() => {
    return services.filter((service) => {
      const matchesCategory = category === "All" || service.category === category;
      const matchesQuery = service.name
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [services, query, category]);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services..."
            className="h-10 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                category === c
                  ? "border-primary bg-primary-muted text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          No services match your search.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((service) => (
            <Link key={service.slug} href={`/buy?service=${service.slug}`} className="group block">
              <Card className="h-full p-6 transition-colors group-hover:border-primary/40 group-hover:bg-secondary">
                <div className="flex items-start justify-between">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: service.color }}
                  >
                    {service.name.slice(0, 1)}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-4 font-semibold">{service.name}</p>
                <p className="text-xs text-muted-foreground">
                  {countAvailableCountries(service)} countries available
                </p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <AvailabilityBadge status={overallAvailability(service)} />
                  <span className="font-semibold">
                    from {formatNairaFromNaira(service.priceFromNaira)}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
