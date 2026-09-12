"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { formatNairaFromNaira } from "@/lib/currency";
import type { CatalogOffer, CatalogService } from "@/lib/catalog";

/**
 * The core Xencodes interface: find a service, choose a country, get a number.
 *
 * One panel with a fixed search field and a single list region beneath it. The
 * list swaps between popular services, search results, and the countries for
 * the chosen service. Nothing floats over anything else, so it behaves the
 * same on a phone as on a desktop. Used on the homepage and on /buy.
 */

export type PurchaseHandler = (
  serviceSlug: string,
  countrySlug: string,
) => void | Promise<void>;

const POPULAR = ["whatsapp", "telegram", "instagram", "facebook", "tiktok", "google"];

const stockLabel = {
  in_stock: "In stock",
  low: "Low stock",
  out_of_stock: "Out of stock",
} as const;

function numberFormat(dialCode: string, digits: number) {
  const groups: string[] = [];
  let left = digits;
  while (left > 0) {
    const take = Math.min(left === 4 ? 4 : 3, left);
    groups.push("X".repeat(take));
    left -= take;
  }
  return `${dialCode} ${groups.join(" ")}`;
}

export function NumberSearch({
  services,
  initialServiceSlug,
  onPurchase,
  pending = false,
  error,
  autoFocus = false,
}: {
  services: CatalogService[];
  initialServiceSlug?: string;
  /** When omitted, choosing a country navigates to /buy. */
  onPurchase?: PurchaseHandler;
  pending?: boolean;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [selected, setSelected] = useState<CatalogService | null>(
    () => services.find((s) => s.slug === initialServiceSlug) ?? null,
  );
  const [countrySlug, setCountrySlug] = useState<string | null>(null);

  const searching = query.trim().length > 0;

  const popular = useMemo(
    () =>
      POPULAR.map((slug) => services.find((s) => s.slug === slug)).filter(
        (service) => service !== undefined,
      ),
    [services],
  );

  const results = useMemo(() => {
    if (!searching) return popular;
    const q = query.trim().toLowerCase();
    return services
      .filter((service) => service.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [searching, query, services, popular]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    optionRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function choose(service: CatalogService) {
    setSelected(service);
    setCountrySlug(null);
    setQuery("");
    setHighlighted(0);
  }

  function reset() {
    setSelected(null);
    setCountrySlug(null);
    setQuery("");
    setHighlighted(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && results[highlighted]) {
      event.preventDefault();
      choose(results[highlighted]);
    } else if (event.key === "Escape") {
      setQuery("");
      setHighlighted(0);
    }
  }

  function selectCountry(offer: CatalogOffer) {
    if (!selected) return;
    setCountrySlug(offer.countrySlug);

    if (onPurchase) {
      void onPurchase(selected.slug, offer.countrySlug);
    } else {
      router.push(`/buy?service=${selected.slug}&country=${offer.countrySlug}`);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-panel)]">
      {/* Step one: the service. */}
      <div className="border-b border-border p-3 sm:p-4">
        {selected ? (
          <div className="flex items-center gap-3 rounded-xl bg-mint-soft px-3 py-2.5">
            <ServiceLogo
              slug={selected.slug}
              name={selected.name}
              color={selected.color}
              size="sm"
              className="bg-surface"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-forest">
                {selected.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selected.offers.length}{" "}
                {selected.offers.length === 1 ? "country" : "countries"} available
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-forest hover:bg-white/70"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <label htmlFor={`${listboxId}-input`} className="sr-only">
              What service do you need a number for?
            </label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id={`${listboxId}-input`}
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              autoComplete="off"
              autoFocus={autoFocus}
              value={query}
              placeholder="Search Instagram, Facebook, Telegram, WhatsApp"
              onChange={(e) => {
                setQuery(e.target.value);
                // Re-aim at the first result as the list changes under it.
                setHighlighted(0);
              }}
              onKeyDown={onKeyDown}
              className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-11 text-[15px] font-medium outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/80 focus:border-mint focus:bg-surface focus:ring-2 focus:ring-mint/25 sm:h-16 sm:text-base"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setHighlighted(0);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-mint-soft"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Step two: the list. Countries once a service is chosen, services before that. */}
      <div className="p-3 sm:p-4">
        {selected ? (
          <>
            <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Choose a country
            </p>
            <ul className="max-h-[19rem] space-y-1 overflow-y-auto">
              {selected.offers.map((offer) => {
                const active = countrySlug === offer.countrySlug;
                return (
                  <li key={offer.countrySlug}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => selectCountry(offer)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-mint bg-mint-soft"
                          : "border-transparent hover:border-border hover:bg-background",
                        pending && !active && "opacity-50",
                      )}
                    >
                      <span aria-hidden className="text-xl leading-none">
                        {offer.flag}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {offer.countryName}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {numberFormat(offer.dialCode, offer.nationalDigits)}
                        </span>
                      </span>

                      <span className="hidden shrink-0 text-right sm:block">
                        <span
                          className={cn(
                            "block text-xs font-medium",
                            offer.stock === "in_stock" ? "text-success" : "text-warning",
                          )}
                        >
                          {stockLabel[offer.stock]}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          about {offer.avgDeliverySeconds}s
                        </span>
                      </span>

                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold tabular-nums">
                          {formatNairaFromNaira(offer.priceNaira)}
                        </span>
                        <span className="block text-xs text-muted-foreground sm:hidden">
                          {stockLabel[offer.stock]}
                        </span>
                      </span>

                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                          active
                            ? "bg-mint text-forest-dark"
                            : "text-muted-foreground group-hover:bg-mint-soft group-hover:text-forest",
                        )}
                      >
                        {pending && active ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : active ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {error ? (
              <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {searching
                ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
                : "Popular right now"}
            </p>

            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No service matches that search. Try another name.
              </p>
            ) : (
              <ul
                id={listboxId}
                role="listbox"
                aria-label="Services"
                className="max-h-[19rem] space-y-0.5 overflow-y-auto"
              >
                {results.map((service, index) => (
                  <li key={service.slug} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlighted}
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => choose(service)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        index === highlighted
                          ? "border-border bg-background"
                          : "border-transparent",
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
                          {service.offers.length}{" "}
                          {service.offers.length === 1 ? "country" : "countries"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatNairaFromNaira(service.priceFromNaira)}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-forest" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
