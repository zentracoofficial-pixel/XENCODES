"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceLogo } from "@/components/marketing/service-logo";

/**
 * The public front door: find the service you need a number for.
 *
 * It picks a service and hands off to the buy page, where the country and
 * the live price for that exact pair are resolved. Deliberately no prices
 * here: a price depends on the country, and a "from" figure on a marketing
 * page is a second pricing path that can drift away from the one the
 * customer is actually charged.
 *
 * With no number provider connected the list is empty and this says so,
 * rather than showing a set of services nobody can buy.
 */

interface ServiceOption {
  slug: string;
  name: string;
  color: string;
  category: string;
  popular: boolean;
}

export function ServicePicker({
  initialServices,
  unavailableMessage,
}: {
  initialServices: ServiceOption[];
  /** Set when no provider is connected. */
  unavailableMessage?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [services, setServices] = useState(initialServices);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  // The server already rendered the first page of services, so the first
  // run of the effect below has nothing to fetch.
  const primed = useRef(false);
  const unavailable = Boolean(unavailableMessage);

  const search = useCallback((next: string) => {
    const token = ++request.current;
    setLoading(true);
    fetch(`/api/inventory/services?q=${encodeURIComponent(next)}`)
      .then((res) => res.json())
      .then((data: { services?: ServiceOption[] }) => {
        if (token !== request.current) return;
        setServices(data.services ?? []);
      })
      .catch(() => {
        if (token === request.current) setServices([]);
      })
      .finally(() => {
        if (token === request.current) setLoading(false);
      });
  }, []);

  // Searching is a server round trip because the catalog is far too large
  // to ship to the browser. Debounced so a fast typist makes one request
  // rather than one per keystroke.
  useEffect(() => {
    if (unavailable) return;
    if (!primed.current) {
      primed.current = true;
      return;
    }
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search, unavailable]);

  const popular = services.filter((service) => service.popular);
  const rest = services.filter((service) => !service.popular);
  const searching = query.trim().length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-panel)]">
      <div className="border-b border-border p-3 sm:p-4">
        <div className="relative">
          <label htmlFor="service-picker" className="sr-only">
            What service do you need a number for?
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            id="service-picker"
            type="text"
            autoComplete="off"
            disabled={unavailable}
            value={query}
            placeholder="Search Instagram, Facebook, Telegram, WhatsApp"
            onChange={(e) => setQuery(e.target.value)}
            className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-11 text-[15px] font-medium outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/80 focus:border-mint focus:bg-surface focus:ring-2 focus:ring-mint/25 disabled:cursor-not-allowed disabled:opacity-60 sm:h-16 sm:text-base"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-mint-soft"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {unavailable ? (
          <div className="flex items-start gap-2.5 px-2 py-8">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-medium">
                Number availability is currently unavailable
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {unavailableMessage} Numbers go back on sale as soon as one is.
              </p>
            </div>
          </div>
        ) : loading && services.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching
          </p>
        ) : services.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            No service matches that search. Try another name.
          </p>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto">
            {popular.length > 0 ? (
              <Group
                label={searching ? "Popular matches" : "Popular services"}
                services={popular}
                onPick={(slug) => router.push(`/buy?service=${slug}`)}
              />
            ) : null}
            {rest.length > 0 ? (
              <Group
                label={popular.length > 0 ? "All services" : "Services"}
                services={rest}
                onPick={(slug) => router.push(`/buy?service=${slug}`)}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Group({
  label,
  services,
  onPick,
}: {
  label: string;
  services: ServiceOption[];
  onPick: (slug: string) => void;
}) {
  return (
    <>
      <p className="px-1 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-0.5 pb-1">
        {services.map((service) => (
          <li key={service.slug}>
            <button
              type="button"
              onClick={() => onPick(service.slug)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors",
                "hover:border-border hover:bg-background",
              )}
            >
              <ServiceLogo
                slug={service.slug}
                name={service.name}
                color={service.color}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {service.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {service.category}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-forest" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
