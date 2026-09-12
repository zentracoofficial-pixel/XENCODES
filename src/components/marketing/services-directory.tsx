"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { AvailabilityDot } from "@/components/marketing/availability-badge";
import { countAvailableCountries } from "@/data/services";
import { formatNairaFromNaira } from "@/lib/currency";
import type { Service, ServiceCategory } from "@/data/types";

function overallAvailability(service: Service) {
  if (service.availability.some((a) => a.status === "available")) return "available" as const;
  if (service.availability.some((a) => a.status === "limited")) return "limited" as const;
  return "unavailable" as const;
}

export function ServicesDirectory({
  services,
  categories,
}: {
  services: Service[];
  categories: ServiceCategory[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ServiceCategory | "All">("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((service) => {
      const matchesCategory = category === "All" || service.category === category;
      const matchesQuery = !q || service.name.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [services, query, category]);

  const tabs: (ServiceCategory | "All")[] = ["All", ...categories];

  return (
    <div>
      <div className="sticky top-16 z-10 -mx-6 border-b border-border bg-background/80 px-6 py-4 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${services.length} services…`}
            className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm outline-none ring-ring transition-shadow focus:ring-2"
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setCategory(tab)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                category === tab
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-medium">No service called “{query}”</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Try another name, or browse a category above.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((service) => (
            <Link
              key={service.slug}
              href={`/buy?service=${service.slug}`}
              className="group rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <ServiceLogo service={service} size="lg" />
                <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>

              <p className="mt-4 font-semibold">{service.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {service.category}
              </p>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <AvailabilityDot
                  status={overallAvailability(service)}
                  label={`${countAvailableCountries(service)} countries`}
                />
                <span className="text-sm font-semibold tabular-nums">
                  {formatNairaFromNaira(service.priceFromNaira)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
